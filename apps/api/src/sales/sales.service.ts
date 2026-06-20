import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerEventType,
  InstallmentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AddPaymentDto } from './dto/add-payment.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateSaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: dto.customerId, deletedAt: null },
        include: { branch: true },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      this.ensureBranchAccess(user, customer.branchId);

      const saleDate = dto.saleDate ?? new Date();
      const receiptNumber = await this.generateReceiptNumber(tx, saleDate);
      const calculatedItems = dto.items.map((item) => {
        const totalPrice = this.roundMoney(item.quantity * item.unitPrice);
        const totalCost = this.roundMoney(item.quantity * item.unitCost);
        const profitAmount = this.roundMoney(totalPrice - totalCost);

        return {
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          totalPrice,
          totalCost,
          profitAmount,
        };
      });
      const totalAmount = this.roundMoney(
        calculatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
      );
      const totalCost = this.roundMoney(
        calculatedItems.reduce((sum, item) => sum + item.totalCost, 0),
      );
      const profitAmount = this.roundMoney(totalAmount - totalCost);
      const paidAmount = this.roundMoney(
        Math.min(dto.paidAmount ?? 0, totalAmount),
      );
      const debtAmount = this.roundMoney(Math.max(totalAmount - paidAmount, 0));
      const paymentStatus = this.getPaymentStatus(totalAmount, paidAmount);
      const qrCodeData = [
        'EMOTORS',
        `Receipt: ${receiptNumber}`,
        `Customer: ${customer.fullName}`,
        `Total: ${totalAmount}`,
        `Paid: ${paidAmount}`,
        `Debt: ${debtAmount}`,
      ].join('\n');

      const sale = await tx.sale.create({
        data: {
          branchId: customer.branchId,
          customerId: customer.id,
          sellerId: user.id,
          receiptNumber,
          saleDate,
          totalAmount,
          totalCost,
          profitAmount,
          paidAmount,
          debtAmount,
          paymentStatus,
          notes: dto.notes,
          items: {
            create: calculatedItems,
          },
          payments:
            paidAmount > 0
              ? {
                  create: {
                    branchId: customer.branchId,
                    customerId: customer.id,
                    amount: paidAmount,
                    method: dto.paymentMethod ?? PaymentMethod.CASH,
                    paidAt: saleDate,
                    note: 'Initial sale payment',
                    createdById: user.id,
                  },
                }
              : undefined,
          installments:
            debtAmount > 0 && (dto.installmentDays || dto.dueDate)
              ? {
                  create: {
                    branchId: customer.branchId,
                    customerId: customer.id,
                    dueDate:
                      dto.dueDate ??
                      new Date(
                        saleDate.getTime() +
                          (dto.installmentDays ?? 0) * 24 * 60 * 60 * 1000,
                      ),
                    amount: debtAmount,
                    paidAmount: 0,
                    status: InstallmentStatus.PENDING,
                  },
                }
              : undefined,
          receipt: {
            create: {
              branchId: customer.branchId,
              receiptNumber,
              qrCodeData,
            },
          },
        },
        include: this.saleInclude(),
      });

      await tx.customerEvent.create({
        data: {
          customerId: customer.id,
          branchId: customer.branchId,
          type: CustomerEventType.SALE,
          message: `Sale ${receiptNumber}: ${totalAmount.toFixed(2)} KGS`,
          createdById: user.id,
        },
      });

      await this.refreshCustomerFinancials(tx, customer.id);

      return this.toSaleResponse(sale);
    });
  }

  async findAll(user: AuthUser, query: SaleQueryDto) {
    const where: Prisma.SaleWhereInput = {
      deletedAt: null,
      ...this.buildBranchWhere(user, query.branchId),
    };

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.from || query.to) {
      where.saleDate = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { receiptNumber: { contains: search, mode: 'insensitive' } },
        { customer: { fullName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            whatsappPhone: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        branch: true,
      },
      orderBy: { saleDate: 'desc' },
    });

    return sales.map((sale) => this.toSaleResponse(sale));
  }

  async findOne(user: AuthUser, id: string) {
    const sale = await this.getAccessibleSale(user, id);
    return this.toSaleResponse(sale);
  }

  async addPayment(user: AuthUser, id: string, dto: AddPaymentDto) {
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);
      const currentDebt = Number(sale.debtAmount);
      const amount = this.roundMoney(Math.min(dto.amount, currentDebt));

      if (amount <= 0) {
        throw new ForbiddenException('Sale is already fully paid');
      }

      await tx.payment.create({
        data: {
          branchId: sale.branchId,
          saleId: sale.id,
          customerId: sale.customerId,
          amount,
          method: dto.method,
          paidAt: dto.paidAt ?? new Date(),
          note: dto.note,
          createdById: user.id,
        },
      });

      const paymentAggregate = await tx.payment.aggregate({
        where: { saleId: sale.id },
        _sum: { amount: true },
      });
      const paidAmount = this.roundMoney(
        Number(paymentAggregate._sum.amount ?? 0),
      );
      const totalAmount = Number(sale.totalAmount);
      const debtAmount = this.roundMoney(Math.max(totalAmount - paidAmount, 0));

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount,
          debtAmount,
          paymentStatus: this.getPaymentStatus(totalAmount, paidAmount),
        },
      });

      await this.refreshInstallments(tx, sale.id, paidAmount);
      await this.refreshCustomerFinancials(tx, sale.customerId);
    });

    return this.findOne(user, id);
  }

  async receipt(user: AuthUser, id: string) {
    const sale = await this.getAccessibleSale(user, id);
    return {
      ...this.toSaleResponse(sale),
      qrCodeData: sale.receipt?.qrCodeData,
      printedAt: sale.receipt?.printedAt,
    };
  }

  async dailyReport(user: AuthUser, query: SaleQueryDto) {
    const now = new Date();
    const from =
      query.from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to =
      query.to ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const branchWhere = this.buildBranchWhere(user, query.branchId);

    const [sales, payments] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          deletedAt: null,
          ...branchWhere,
          saleDate: { gte: from, lte: to },
        },
        select: {
          totalAmount: true,
          paidAmount: true,
          debtAmount: true,
          profitAmount: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          ...branchWhere,
          paidAt: { gte: from, lte: to },
        },
        select: {
          amount: true,
          method: true,
        },
      }),
    ]);

    return {
      totalSalesAmount: this.sumDecimals(sales.map((sale) => sale.totalAmount)),
      totalPaidAmount: this.sumDecimals(sales.map((sale) => sale.paidAmount)),
      totalDebtAmount: this.sumDecimals(sales.map((sale) => sale.debtAmount)),
      totalProfitAmount: this.sumDecimals(
        sales.map((sale) => sale.profitAmount),
      ),
      saleCount: sales.length,
      cashPayments: this.sumPayments(payments, [PaymentMethod.CASH]),
      transferPayments: this.sumPayments(payments, [
        PaymentMethod.TRANSFER,
        PaymentMethod.MBANK,
        PaymentMethod.ELCART,
      ]),
      cardPayments: this.sumPayments(payments, [PaymentMethod.CARD]),
    };
  }

  private saleInclude() {
    return {
      branch: true,
      customer: true,
      seller: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
      items: true,
      payments: {
        include: {
          createdBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { paidAt: 'desc' as const },
      },
      installments: {
        orderBy: { dueDate: 'asc' as const },
      },
      receipt: true,
    };
  }

  private async getAccessibleSale(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.role === Role.OWNER ? {} : { branchId: user.branchId }),
      },
      include: this.saleInclude(),
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private async getAccessibleSaleInTx(
    tx: PrismaTx,
    user: AuthUser,
    id: string,
  ) {
    const sale = await tx.sale.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.role === Role.OWNER ? {} : { branchId: user.branchId }),
      },
      include: {
        installments: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private buildBranchWhere(user: AuthUser, requestedBranchId?: string) {
    if (user.role === Role.OWNER) {
      return requestedBranchId ? { branchId: requestedBranchId } : {};
    }

    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }

    return { branchId: user.branchId };
  }

  private ensureBranchAccess(user: AuthUser, branchId: string) {
    if (user.role !== Role.OWNER && user.branchId !== branchId) {
      throw new ForbiddenException('You can only access your own branch');
    }
  }

  private async generateReceiptNumber(tx: PrismaTx, saleDate: Date) {
    const datePart = saleDate.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await tx.sale.count({
      where: {
        saleDate: {
          gte: new Date(
            saleDate.getFullYear(),
            saleDate.getMonth(),
            saleDate.getDate(),
          ),
        },
      },
    });

    return `EM-${datePart}-${String(count + 1).padStart(5, '0')}`;
  }

  private getPaymentStatus(totalAmount: number, paidAmount: number) {
    if (paidAmount >= totalAmount) {
      return PaymentStatus.PAID;
    }

    if (paidAmount > 0) {
      return PaymentStatus.PARTIAL;
    }

    return PaymentStatus.DEBT;
  }

  private async refreshInstallments(
    tx: PrismaTx,
    saleId: string,
    salePaidAmount: number,
  ) {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        installments: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!sale) {
      return;
    }

    let remainingPaid = salePaidAmount;

    for (const installment of sale.installments) {
      const amount = Number(installment.amount);
      const paidAmount = this.roundMoney(Math.min(remainingPaid, amount));
      remainingPaid = this.roundMoney(Math.max(remainingPaid - amount, 0));
      const status =
        paidAmount >= amount
          ? InstallmentStatus.PAID
          : paidAmount > 0
            ? InstallmentStatus.PARTIAL
            : installment.dueDate < new Date()
              ? InstallmentStatus.OVERDUE
              : InstallmentStatus.PENDING;

      await tx.installmentSchedule.update({
        where: { id: installment.id },
        data: {
          paidAmount,
          status,
        },
      });
    }
  }

  private async refreshCustomerFinancials(tx: PrismaTx, customerId: string) {
    const sales = await tx.sale.findMany({
      where: {
        customerId,
        deletedAt: null,
      },
      select: {
        totalAmount: true,
        profitAmount: true,
        debtAmount: true,
      },
    });

    await tx.customer.update({
      where: { id: customerId },
      data: {
        totalPurchaseAmount: this.sumDecimals(
          sales.map((sale) => sale.totalAmount),
        ),
        totalProfitAmount: this.sumDecimals(
          sales.map((sale) => sale.profitAmount),
        ),
        totalDebtAmount: this.sumDecimals(sales.map((sale) => sale.debtAmount)),
      },
    });
  }

  private toSaleResponse(sale: any) {
    return {
      ...sale,
      totalAmount: Number(sale.totalAmount),
      totalCost: Number(sale.totalCost),
      profitAmount: Number(sale.profitAmount),
      paidAmount: Number(sale.paidAmount),
      debtAmount: Number(sale.debtAmount),
      items: sale.items?.map((item: any) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        unitCost: Number(item.unitCost),
        totalPrice: Number(item.totalPrice),
        totalCost: Number(item.totalCost),
        profitAmount: Number(item.profitAmount),
      })),
      payments: sale.payments?.map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
      installments: sale.installments?.map((installment: any) => ({
        ...installment,
        amount: Number(installment.amount),
        paidAmount: Number(installment.paidAmount),
      })),
    };
  }

  private sumDecimals(values: Prisma.Decimal[]) {
    return this.roundMoney(
      values.reduce((sum, value) => sum + Number(value ?? 0), 0),
    );
  }

  private sumPayments(
    payments: Array<{ amount: Prisma.Decimal; method: PaymentMethod }>,
    methods: PaymentMethod[],
  ) {
    return this.sumDecimals(
      payments
        .filter((payment) => methods.includes(payment.method))
        .map((payment) => payment.amount),
    );
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
