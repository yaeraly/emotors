/**
 * Repair inflated China domestic transport costing caused by duplicate section expenses
 * or stale order.chinaDomesticTransportKgs scalars (e.g. 23,400 instead of 7,800).
 *
 * Usage:
 *   npx tsx apps/api/scripts/repair-china-domestic-transport-cost-duplication.ts
 *   npx tsx apps/api/scripts/repair-china-domestic-transport-cost-duplication.ts --apply
 *   npx tsx apps/api/scripts/repair-china-domestic-transport-cost-duplication.ts --apply --order-id=<id>
 */
import { PrismaClient, TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import { LandedCostService } from '../src/procurement/landed-cost.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  hasApprovedSectionExpenses,
  resolveSectionCostKgsFromApprovedExpenses,
  sumConfirmedExpenseAmountKgs,
} from '../src/procurement/procurement-cost.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const orderIdArg = process.argv.find((arg) => arg.startsWith('--order-id='));
const orderIdFilter = orderIdArg ? orderIdArg.slice('--order-id='.length) : undefined;

const APPROVED = new Set<string>([
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAYMENT_POSTPONED,
  TransportExpenseStatus.PAID,
]);

const STATUS_PRIORITY: Record<string, number> = {
  [TransportExpenseStatus.PAID]: 5,
  [TransportExpenseStatus.PARTIALLY_PAID]: 4,
  [TransportExpenseStatus.PENDING_CASHIER]: 3,
  [TransportExpenseStatus.PAYMENT_POSTPONED]: 2,
  [TransportExpenseStatus.WAITING_ACCOUNTANT]: 1,
  [TransportExpenseStatus.DRAFT]: 0,
};

function mapRow(row: {
  id: string;
  amount: unknown;
  currency: string;
  exchangeRate: unknown;
  amountKgs: unknown;
  calculatedAmountKgs: unknown;
  paidAmountKgs: unknown;
  status: TransportExpenseStatus;
}) {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
    amountKgs: Number(row.amountKgs || row.calculatedAmountKgs || 0),
    paidAmountKgs: row.paidAmountKgs != null ? Number(row.paidAmountKgs) : null,
    status: row.status,
  };
}

function pickAuthoritativeExpense<T extends { id: string; status: TransportExpenseStatus; paidAmountKgs: unknown }>(
  rows: T[],
): T {
  return [...rows].sort((a, b) => {
    const paidDiff = Number(b.paidAmountKgs || 0) - Number(a.paidAmountKgs || 0);
    if (paidDiff !== 0) return paidDiff;
    const statusDiff = (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0);
    if (statusDiff !== 0) return statusDiff;
    return a.id.localeCompare(b.id);
  })[0];
}

async function main() {
  const expenses = await prisma.procurementTransportExpense.findMany({
    where: {
      expenseType: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
      procurementOrderId: orderIdFilter ? orderIdFilter : { not: null },
      status: { not: TransportExpenseStatus.CANCELLED },
    },
    select: {
      id: true,
      expenseNumber: true,
      procurementOrderId: true,
      amount: true,
      currency: true,
      exchangeRate: true,
      amountKgs: true,
      calculatedAmountKgs: true,
      paidAmountKgs: true,
      status: true,
      ledgerEntryId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const byOrder = new Map<string, typeof expenses>();
  for (const row of expenses) {
    if (!row.procurementOrderId) continue;
    const list = byOrder.get(row.procurementOrderId) ?? [];
    list.push(row);
    byOrder.set(row.procurementOrderId, list);
  }

  const prismaService = Object.assign(new PrismaService(), prisma);
  const landedCostService = new LandedCostService(prismaService);

  let repairCount = 0;
  for (const [orderId, rows] of byOrder.entries()) {
    const order = await prisma.procurementOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        defaultYuanRate: true,
        weightedAverageYuanRate: true,
        totalPaidYuan: true,
        chinaDomesticTransportYuan: true,
        chinaDomesticTransportKgs: true,
        hqStockMovementCreatedAt: true,
        landedCostStatus: true,
      },
    });
    if (!order) continue;

    const rate =
      order.weightedAverageYuanRate != null && Number(order.totalPaidYuan) > 0
        ? Number(order.weightedAverageYuanRate)
        : Number(order.defaultYuanRate || 0);

    const costRows = rows.map(mapRow);
    const approvedRows = costRows.filter((row) => APPROVED.has(row.status));
    const authoritativeKgs = sumConfirmedExpenseAmountKgs(approvedRows, rate);
    const resolvedKgs = resolveSectionCostKgsFromApprovedExpenses({
      confirmedFromExpenses: authoritativeKgs,
      storedOrderKgs: Number(order.chinaDomesticTransportKgs || 0),
      hasApprovedExpenseRows: hasApprovedSectionExpenses(approvedRows),
    });

    const duplicateGroups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!APPROVED.has(row.status)) continue;
      const key = `${Number(row.amount)}|${row.currency}|${Number(row.exchangeRate || rate)}`;
      const group = duplicateGroups.get(key) ?? [];
      group.push(row);
      duplicateGroups.set(key, group);
    }

    const duplicateIdsToCancel: string[] = [];
    for (const group of duplicateGroups.values()) {
      if (group.length <= 1) continue;
      const keeper = pickAuthoritativeExpense(group);
      for (const row of group) {
        if (row.id !== keeper.id) duplicateIdsToCancel.push(row.id);
      }
    }

    const afterCancelKgs =
      duplicateIdsToCancel.length > 0
        ? sumConfirmedExpenseAmountKgs(
            approvedRows.filter((row) => !duplicateIdsToCancel.includes(row.id)),
            rate,
          )
        : authoritativeKgs;

    const nextKgs = resolveSectionCostKgsFromApprovedExpenses({
      confirmedFromExpenses: afterCancelKgs,
      storedOrderKgs: Number(order.chinaDomesticTransportKgs || 0),
      hasApprovedExpenseRows: hasApprovedSectionExpenses(
        approvedRows.filter((row) => !duplicateIdsToCancel.includes(row.id)),
      ),
    });

    const storedKgs = Number(order.chinaDomesticTransportKgs || 0);
    const needsRepair =
      duplicateIdsToCancel.length > 0 ||
      Math.abs(storedKgs - nextKgs) > 0.009 ||
      (authoritativeKgs > 0 && Math.abs(authoritativeKgs - nextKgs) > 0.009 && duplicateIdsToCancel.length > 0);

    if (!needsRepair) continue;

    repairCount += 1;
    const report = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      chinaDomesticTransportYuan: Number(order.chinaDomesticTransportYuan || 0),
      exchangeRate: rate,
      expenseRecordsFound: rows.length,
      approvedExpenseRecords: approvedRows.length,
      duplicateExpenseIdsToCancel: duplicateIdsToCancel,
      before: {
        chinaDomesticTransportKgs: storedKgs,
        summedApprovedKgs: authoritativeKgs,
      },
      after: {
        chinaDomesticTransportKgs: nextKgs,
        summedApprovedKgs: afterCancelKgs,
      },
      hqReceived: Boolean(order.hqStockMovementCreatedAt),
      apply,
    };
    console.log(JSON.stringify(report));

    if (!apply) continue;

    if (duplicateIdsToCancel.length > 0) {
      await prisma.procurementTransportExpense.updateMany({
        where: { id: { in: duplicateIdsToCancel } },
        data: {
          status: TransportExpenseStatus.CANCELLED,
          comment: 'Voided by repair-china-domestic-transport-cost-duplication (duplicate section expense)',
        },
      });
    }

    await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { chinaDomesticTransportKgs: nextKgs },
    });

    await prisma.auditLog.create({
      data: {
        action: 'PROCUREMENT_COST_RECALCULATED',
        entity: 'ProcurementOrder',
        entityId: order.id,
        metadata: {
          repairScript: 'repair-china-domestic-transport-cost-duplication',
          duplicateExpenseIdsCancelled: duplicateIdsToCancel,
          chinaDomesticTransportKgs: nextKgs,
          timestamp: new Date().toISOString(),
        },
      },
    });

    await landedCostService.recalculateProcurementOrder(order.id, {
      reason: 'repair-china-domestic-transport-cost-duplication',
      triggerReason: 'CHINA_DOMESTIC_TRANSPORT_DEDUP',
      allowAfterFinalize: Boolean(order.hqStockMovementCreatedAt),
    });
  }

  console.log(`Repair scan complete. ordersNeedingRepair=${repairCount} apply=${apply}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
