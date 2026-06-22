import {
  BadRequestException,
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
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CommissionsService } from '../commissions/commissions.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddPaymentDto } from './dto/add-payment.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly commissionsService: CommissionsService,
  ) {}

  create(user: AuthUser, dto: CreateSaleDto) {
    return this.createDraft(user, dto);
  }

  async createDraft(user: AuthUser, dto: CreateSaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await this.getCustomerForSale(tx, user, dto.customerId);
      const saleDate = dto.saleDate ?? new Date();
      const receiptNumber = await this.generateReceiptNumber(tx, saleDate);
      const totals = this.calculateSale(dto);
      const draftReceiptText = this.buildReceiptText({
        receiptNumber,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        sellerName: user.fullName,
        saleDate,
        items: dto.items,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        debtAmount: totals.totalAmount,
        paymentStatus: PaymentStatus.DEBT,
        receiptStatus: 'DRAFT',
      });

      const sale = await tx.sale.create({
        data: {
          branchId: customer.branchId,
          customerId: customer.id,
          sellerId: user.id,
          receiptNumber,
          saleDate,
          totalAmount: totals.totalAmount,
          totalCost: totals.totalCost,
          profitAmount: totals.profitAmount,
          paidAmount: 0,
          debtAmount: totals.totalAmount,
          paymentStatus: PaymentStatus.DEBT,
          status: SaleStatus.DRAFT,
          draftReceiptText,
          notes: dto.notes,
          items: { create: totals.items },
          installments: this.buildInstallmentCreate(
            dto,
            customer.branchId,
            customer.id,
            totals.totalAmount,
            saleDate,
          ),
          receipt: {
            create: {
              branchId: customer.branchId,
              receiptNumber,
              qrCodeData: draftReceiptText,
            },
          },
        },
        include: this.saleInclude(),
      });

      return this.toSaleResponse(sale);
    });
  }

  async updateDraft(user: AuthUser, id: string, dto: CreateSaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);

      if (
        sale.status !== SaleStatus.DRAFT &&
        sale.status !== SaleStatus.SENT_TO_CUSTOMER
      ) {
        throw new BadRequestException('Cannot edit finalized or approved sale');
      }

      const customer = await this.getCustomerForSale(tx, user, dto.customerId);
      const saleDate = dto.saleDate ?? sale.saleDate;
      const totals = this.calculateSale(dto);
      const paymentAggregate = await tx.payment.aggregate({
        where: { saleId: sale.id },
        _sum: { amount: true },
      });
      const paidAmount = this.roundMoney(
        Number(paymentAggregate._sum.amount ?? 0),
      );
      const debtAmount = this.roundMoney(
        Math.max(totals.totalAmount - paidAmount, 0),
      );
      const paymentStatus = this.getPaymentStatus(totals.totalAmount, paidAmount);
      const draftReceiptText = this.buildReceiptText({
        receiptNumber: sale.receiptNumber,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        sellerName: user.fullName,
        saleDate,
        items: dto.items,
        totalAmount: totals.totalAmount,
        paidAmount,
        debtAmount,
        paymentStatus,
        receiptStatus: 'DRAFT',
      });

      await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
      await tx.installmentSchedule.deleteMany({ where: { saleId: sale.id } });

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          customerId: customer.id,
          branchId: customer.branchId,
          saleDate,
          totalAmount: totals.totalAmount,
          totalCost: totals.totalCost,
          profitAmount: totals.profitAmount,
          paidAmount,
          debtAmount,
          paymentStatus,
          draftReceiptText,
          notes: dto.notes,
          items: { create: totals.items },
          installments: this.buildInstallmentCreate(
            dto,
            customer.branchId,
            customer.id,
            debtAmount,
            saleDate,
          ),
          receipt: {
            update: {
              branchId: customer.branchId,
              qrCodeData: draftReceiptText,
            },
          },
        },
        include: this.saleInclude(),
      });

      await this.refreshInstallments(tx, sale.id, paidAmount);
      return this.toSaleResponse(updated);
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

  async sendWhatsApp(user: AuthUser, id: string) {
    const sale = await this.getAccessibleSale(user, id);

    if (sale.status === SaleStatus.FINALIZED || sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('Cannot send finalized or cancelled sale');
    }

    const message = sale.draftReceiptText ?? sale.receipt?.qrCodeData ?? '';
    const phone = (sale.customer.whatsappPhone || sale.customer.phone).replace(
      /\D/g,
      '',
    );
    const whatsappMessageText = `Саламатсызбы! EMOTORS сатуу чеги:\n\n${message}`;
    const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(
      whatsappMessageText,
    )}`;

    const updated = await this.prisma.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.SENT_TO_CUSTOMER,
        whatsappMessageText,
        sentToCustomerAt: new Date(),
      },
      include: this.saleInclude(),
    });

    return {
      sale: this.toSaleResponse(updated),
      whatsappLink,
      whatsappMessageText,
    };
  }

  async approve(user: AuthUser, id: string) {
    const sale = await this.getAccessibleSale(user, id);

    if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.FINALIZED) {
      throw new BadRequestException('Cannot approve this sale');
    }

    const updated = await this.prisma.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.APPROVED_BY_CUSTOMER,
        approvedAt: new Date(),
      },
      include: this.saleInclude(),
    });

    return this.toSaleResponse(updated);
  }

  async addPayment(user: AuthUser, id: string, dto: AddPaymentDto) {
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);

      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Cannot add payment to cancelled sale');
      }

      const amount = this.roundMoney(dto.amount);

      if (amount <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
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

      await this.refreshSalePaymentState(tx, sale.id);

      if (sale.status === SaleStatus.FINALIZED) {
        await this.refreshCustomerFinancials(tx, sale.customerId);
      }
    });

    return this.findOne(user, id);
  }

  async finalize(user: AuthUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);

      if (
        sale.status !== SaleStatus.APPROVED_BY_CUSTOMER &&
        sale.status !== SaleStatus.SENT_TO_CUSTOMER
      ) {
        throw new BadRequestException('Cannot finalize sale before approval');
      }

      await this.refreshSalePaymentState(tx, sale.id);
      const refreshed = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { payments: true, customer: true, seller: true, items: true },
      });
      const finalReceiptText = this.buildReceiptText({
        receiptNumber: refreshed.receiptNumber,
        customerName: refreshed.customer.fullName,
        customerPhone: refreshed.customer.phone,
        sellerName: refreshed.seller.fullName,
        saleDate: refreshed.saleDate,
        items: refreshed.items,
        totalAmount: Number(refreshed.totalAmount),
        paidAmount: Number(refreshed.paidAmount),
        debtAmount: Number(refreshed.debtAmount),
        paymentStatus: refreshed.paymentStatus,
        receiptStatus: 'FINAL',
      });

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.FINALIZED,
          finalizedAt: new Date(),
          receipt: {
            update: {
              qrCodeData: finalReceiptText,
            },
          },
        },
      });

      await tx.customerEvent.create({
        data: {
          customerId: sale.customerId,
          branchId: sale.branchId,
          type: CustomerEventType.SALE,
          message: `Finalized sale ${sale.receiptNumber}: ${Number(
            sale.totalAmount,
          ).toFixed(2)} KGS`,
          createdById: user.id,
        },
      });

      for (const item of refreshed.items) {
        if (!item.productId) {
          continue;
        }

        await this.inventoryService.createStockMovementInTx(tx, user, {
          productId: item.productId,
          warehouseId: await this.getProductWarehouseId(tx, item.productId),
          type: StockMovementType.SALE,
          quantity: item.quantity,
          unitCostKgs: Number(item.unitCost),
          referenceType: 'SALE',
          referenceId: sale.id,
          note: `Sale ${sale.receiptNumber}`,
        });
      }

      await this.refreshCustomerFinancials(tx, sale.customerId);
      await this.commissionsService.createSalesCommission(tx, sale.id);
    });

    return this.findOne(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const sale = await this.getAccessibleSaleInTx(tx, user, id);

      if (sale.status === SaleStatus.FINALIZED && user.role !== Role.OWNER) {
        throw new ForbiddenException('Only OWNER can cancel finalized sale');
      }

      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Sale is already cancelled');
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      if (sale.status === SaleStatus.FINALIZED) {
        await this.refreshCustomerFinancials(tx, sale.customerId);
      }
    });

    return this.findOne(user, id);
  }

  async receipt(user: AuthUser, id: string) {
    const sale = await this.getAccessibleSale(user, id);
    const receiptStatus =
      sale.status === SaleStatus.FINALIZED ? 'FINAL' : 'DRAFT';

    return {
      ...this.toSaleResponse(sale),
      receiptStatus,
      receiptText:
        receiptStatus === 'FINAL'
          ? sale.receipt?.qrCodeData
          : sale.draftReceiptText ?? sale.receipt?.qrCodeData,
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
          status: SaleStatus.FINALIZED,
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
          sale: { status: SaleStatus.FINALIZED },
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
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.QR,
        PaymentMethod.MBANK,
        PaymentMethod.ELCART,
      ]),
      cardPayments: this.sumPayments(payments, [PaymentMethod.CARD]),
    };
  }

  private calculateSale(dto: CreateSaleDto) {
    const items = dto.items.map((item) => {
      const totalPrice = this.roundMoney(item.quantity * item.unitPrice);
      const totalCost = this.roundMoney(item.quantity * item.unitCost);
      const profitAmount = this.roundMoney(totalPrice - totalCost);

      return {
        productId: item.productId,
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
      items.reduce((sum, item) => sum + item.totalPrice, 0),
    );
    const totalCost = this.roundMoney(
      items.reduce((sum, item) => sum + item.totalCost, 0),
    );

    return {
      items,
      totalAmount,
      totalCost,
      profitAmount: this.roundMoney(totalAmount - totalCost),
    };
  }

  private buildInstallmentCreate(
    dto: CreateSaleDto,
    branchId: string,
    customerId: string,
    debtAmount: number,
    saleDate: Date,
  ) {
    if (!(debtAmount > 0 && (dto.installmentDays || dto.dueDate))) {
      return undefined;
    }

    return {
      create: {
        branchId,
        customerId,
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

  private async getCustomerForSale(
    tx: PrismaTx,
    user: AuthUser,
    customerId: string,
  ) {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { branch: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    this.ensureBranchAccess(user, customer.branchId);
    return customer;
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
        installments: { orderBy: { dueDate: 'asc' } },
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

  private async getProductWarehouseId(tx: PrismaTx, productId: string) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { warehouseId: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product.warehouseId;
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

  private async refreshSalePaymentState(tx: PrismaTx, saleId: string) {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      select: { totalAmount: true },
    });
    const paymentAggregate = await tx.payment.aggregate({
      where: { saleId },
      _sum: { amount: true },
    });
    const paidAmount = this.roundMoney(
      Number(paymentAggregate._sum.amount ?? 0),
    );
    const totalAmount = Number(sale.totalAmount);
    const debtAmount = this.roundMoney(Math.max(totalAmount - paidAmount, 0));

    await tx.sale.update({
      where: { id: saleId },
      data: {
        paidAmount,
        debtAmount,
        paymentStatus: this.getPaymentStatus(totalAmount, paidAmount),
      },
    });
    await this.refreshInstallments(tx, saleId, paidAmount);
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
        installments: { orderBy: { dueDate: 'asc' } },
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
        data: { paidAmount, status },
      });
    }
  }

  private async refreshCustomerFinancials(tx: PrismaTx, customerId: string) {
    const sales = await tx.sale.findMany({
      where: {
        customerId,
        deletedAt: null,
        status: SaleStatus.FINALIZED,
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

  private buildReceiptText(input: {
    receiptNumber: string;
    customerName: string;
    customerPhone: string;
    sellerName: string;
    saleDate: Date;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice?: number | Prisma.Decimal;
      totalPrice?: number | Prisma.Decimal;
    }>;
    totalAmount: number;
    paidAmount: number;
    debtAmount: number;
    paymentStatus: PaymentStatus;
    receiptStatus: 'DRAFT' | 'FINAL';
  }) {
    const itemLines = input.items
      .map((item) => {
        const total =
          item.totalPrice !== undefined
            ? Number(item.totalPrice)
            : item.quantity * Number(item.unitPrice ?? 0);
        return `- ${item.productName} x ${item.quantity}: ${total.toFixed(2)} KGS`;
      })
      .join('\n');

    return [
      `EMOTORS ${input.receiptStatus} RECEIPT`,
      `Receipt: ${input.receiptNumber}`,
      `Date: ${input.saleDate.toLocaleString()}`,
      `Seller: ${input.sellerName}`,
      `Customer: ${input.customerName}`,
      `Phone: ${input.customerPhone}`,
      '',
      itemLines,
      '',
      `Total: ${input.totalAmount.toFixed(2)} KGS`,
      `Paid: ${input.paidAmount.toFixed(2)} KGS`,
      `Debt: ${input.debtAmount.toFixed(2)} KGS`,
      `Status: ${input.paymentStatus}`,
    ].join('\n');
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
