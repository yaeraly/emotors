import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { BranchAccessService } from '../common/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto, SalePaymentDto } from './dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  async create(user: AuthUser, dto: CreateSaleDto) {
    const branchId = dto.customerId
      ? await this.branchIdFromCustomer(user, dto.customerId)
      : this.branchAccess.resolveBranchId(user, dto.branchId);

    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const discount = dto.discount ?? 0;
    const total = Math.max(subtotal - discount, 0);
    const profit = dto.items.reduce(
      (sum, item) =>
        sum + item.quantity * (item.unitPrice - (item.unitCost ?? 0)),
      0,
    );
    const paidAmount =
      dto.payments?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
    const debtAmount = Math.max(total - paidAmount, 0);
    const paymentStatus = this.paymentStatus(total, paidAmount);
    const saleNumber = this.number('SALE');
    const receiptNumber = this.number('RCPT');

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          branchId,
          customerId: dto.customerId,
          number: saleNumber,
          subtotal,
          discount,
          total,
          profit,
          paidAmount,
          debtAmount,
          paymentStatus,
          items: {
            create: dto.items.map((item) => ({
              branchId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost ?? 0,
              total: item.quantity * item.unitPrice,
              profit: item.quantity * (item.unitPrice - (item.unitCost ?? 0)),
            })),
          },
          payments: {
            create:
              dto.payments?.map((payment) => ({
                branchId,
                amount: payment.amount,
                method: payment.method ?? 'CASH',
                note: payment.note,
              })) ?? [],
          },
          installments: {
            create:
              dto.installments?.map((installment) => ({
                branchId,
                dueDate: new Date(installment.dueDate),
                amount: installment.amount,
              })) ?? [],
          },
        },
        include: {
          customer: true,
          items: true,
          payments: true,
          installments: true,
        },
      });

      const receipt = await tx.receipt.create({
        data: {
          saleId: sale.id,
          branchId,
          number: receiptNumber,
          qrPayload: JSON.stringify({
            saleId: sale.id,
            saleNumber: sale.number,
            total,
            issuedAt: new Date().toISOString(),
          }),
        },
      });

      if (dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: {
            status: 'ACTIVE',
            totalPurchaseAmount: { increment: total },
            totalProfitAmount: { increment: profit },
            totalDebtAmount: { increment: debtAmount },
          },
        });
      }

      return { ...sale, receipt };
    });
  }

  list(user: AuthUser) {
    return this.prisma.sale.findMany({
      where: this.branchAccess.scope(user),
      include: { customer: true, receipt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, ...this.branchAccess.scope(user) },
      include: {
        customer: true,
        items: true,
        payments: { orderBy: { paidAt: 'desc' } },
        installments: { orderBy: { dueDate: 'asc' } },
        receipt: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  async addPayment(user: AuthUser, saleId: string, dto: SalePaymentDto) {
    const sale = await this.findOne(user, saleId);
    const total = Number(sale.total);
    const previousDebt = Number(sale.debtAmount);
    const paidAmount = Number(sale.paidAmount) + dto.amount;
    const debtAmount = Math.max(total - paidAmount, 0);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          saleId,
          branchId: sale.branchId,
          amount: dto.amount,
          method: dto.method ?? 'CASH',
          note: dto.note,
        },
      });

      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: {
          paidAmount,
          debtAmount,
          paymentStatus: this.paymentStatus(total, paidAmount),
        },
        include: { customer: true, receipt: true },
      });

      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: {
            totalDebtAmount: {
              decrement: Math.max(previousDebt - debtAmount, 0),
            },
          },
        });
      }

      return { payment, sale: updatedSale };
    });
  }

  async dailyReport(user: AuthUser, date?: string) {
    const day = date ? new Date(date) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const where: Prisma.SaleWhereInput = {
      ...this.branchAccess.scope(user),
      createdAt: { gte: start, lte: end },
    };
    const sales = await this.prisma.sale.findMany({ where });
    const totals = sales.reduce(
      (acc, sale) => ({
        count: acc.count + 1,
        revenue: acc.revenue + Number(sale.total),
        paid: acc.paid + Number(sale.paidAmount),
        debt: acc.debt + Number(sale.debtAmount),
        profit: acc.profit + Number(sale.profit),
      }),
      { count: 0, revenue: 0, paid: 0, debt: 0, profit: 0 },
    );

    return {
      date: start.toISOString().slice(0, 10),
      ...totals,
    };
  }

  private async branchIdFromCustomer(user: AuthUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...this.branchAccess.scope(user) },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer.branchId;
  }

  private paymentStatus(total: number, paid: number): PaymentStatus {
    if (paid >= total) {
      return 'PAID';
    }
    return paid > 0 ? 'PARTIAL' : 'DEBT';
  }

  private number(prefix: string) {
    const suffix = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 7)}`.toUpperCase();
    return `${prefix}-${suffix}`;
  }
}
