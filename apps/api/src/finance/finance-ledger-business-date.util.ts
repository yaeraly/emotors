import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type DateRange = {
  gte?: Date;
  lte?: Date;
};

function buildRange(dateFrom?: string, dateTo?: string): DateRange | undefined {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
  };
}

/**
 * Build FinanceLedgerEntry filter that respects business dates on linked finance records.
 */
export async function buildLedgerBusinessDateWhere(
  prisma: PrismaService,
  dateFrom?: string,
  dateTo?: string,
): Promise<Prisma.FinanceLedgerEntryWhereInput | undefined> {
  const range = buildRange(dateFrom, dateTo);
  if (!range) return undefined;

  const [
    transfers,
    expenses,
    supplierPayments,
    transportExpenses,
    investments,
  ] = await Promise.all([
    prisma.financeTransfer.findMany({
      where: { transferDate: range },
      select: { id: true },
    }),
    prisma.financeExpense.findMany({
      where: { expenseDate: range },
      select: { id: true },
    }),
    prisma.procurementSupplierPayment.findMany({
      where: { paymentDate: range },
      select: { id: true },
    }),
    prisma.procurementTransportExpense.findMany({
      where: {
        OR: [{ paidAt: range }, { invoiceDate: range }],
      },
      select: { id: true },
    }),
    prisma.financeInvestment.findMany({
      where: { investmentDate: range, deletedAt: null },
      select: { id: true },
    }),
  ]);

  const orConditions: Prisma.FinanceLedgerEntryWhereInput[] = [];

  if (transfers.length) {
    orConditions.push({ transferId: { in: transfers.map((t) => t.id) } });
  }

  if (expenses.length) {
    orConditions.push({
      referenceType: 'FinanceExpense',
      referenceId: { in: expenses.map((e) => e.id) },
    });
  }

  if (supplierPayments.length) {
    orConditions.push({
      procurementSupplierPayment: { id: { in: supplierPayments.map((p) => p.id) } },
    });
  }

  if (transportExpenses.length) {
    orConditions.push({
      transportExpense: { id: { in: transportExpenses.map((t) => t.id) } },
    });
  }

  if (investments.length) {
    orConditions.push({
      financeInvestment: { id: { in: investments.map((i) => i.id) } },
    });
  }

  orConditions.push({
    AND: [
      { transferId: null },
      { procurementSupplierPayment: null },
      { transportExpense: null },
      { financeInvestment: null },
      {
        OR: [
          { referenceType: null },
          { referenceType: { not: 'FinanceExpense' } },
        ],
      },
      { createdAt: range },
    ],
  });

  return { OR: orConditions };
}
