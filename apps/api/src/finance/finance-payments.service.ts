import { Injectable } from '@nestjs/common';
import { PaymentRecordStatus, PaymentStatus, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { isBranchCashierUser } from '../rbac/rbac';
import { hasCashierCapability } from '../rbac/cashier-capability.util';
import { resolveFinanceScopeFilter } from './finance-access.util';
import { FinancePaymentsQueryDto } from './dto/finance-payments-query.dto';

@Injectable()
export class FinancePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayments(user: AuthUser, query: FinancePaymentsQueryDto) {
    const scopeFilter = resolveFinanceScopeFilter(user, query.branchId);
    const branchId = scopeFilter.branchId ?? user.branchId ?? undefined;

    const sales = await this.prisma.sale.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(query.status === 'PENDING'
          ? { debtAmount: { gt: 0 }, status: { not: SaleStatus.CANCELLED } }
          : {}),
        ...(query.status === 'PAID' ? { paymentStatus: PaymentStatus.PAID } : {}),
        ...(query.status === 'PARTIAL' ? { paymentStatus: PaymentStatus.PARTIAL } : {}),
        ...(query.search
          ? {
              OR: [
                { receiptNumber: { contains: query.search, mode: 'insensitive' } },
                { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
                { customer: { phone: { contains: query.search } } },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        seller: { select: { id: true, fullName: true } },
        payments: {
          where: { status: PaymentRecordStatus.ACTIVE },
          orderBy: { paidAt: 'desc' },
          include: { createdBy: { select: { id: true, fullName: true } } },
        },
        receipt: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
    });

    return sales.map((sale) => ({
      id: sale.id,
      source: 'SALE',
      sourceNumber: sale.receiptNumber,
      receiptNumber: sale.receipt?.receiptNumber ?? sale.receiptNumber,
      customer: sale.customer,
      totalAmount: Number(sale.totalAmount),
      paidAmount: Number(sale.paidAmount),
      remainingAmount: Number(sale.debtAmount),
      status: sale.paymentStatus,
      saleStatus: sale.status,
      cashier: sale.payments[0]?.createdBy ?? null,
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method,
        paidAt: payment.paidAt,
        createdBy: payment.createdBy,
      })),
      date: sale.saleDate,
      canAccept: hasCashierCapability(user) && Number(sale.debtAmount) > 0,
    }));
  }

  async listPendingPayments(user: AuthUser, query: FinancePaymentsQueryDto) {
    return this.listPayments(user, { ...query, status: 'PENDING' });
  }
}
