/**
 * Idempotent repair: sync order section totals from HQ Accountant-approved transport expenses
 * that were not yet reflected in localTransportKgs / cargo / china domestic totals.
 *
 * Usage:
 *   npx tsx apps/api/scripts/repair-approved-unpaid-procurement-expense-allocation.ts
 *   npx tsx apps/api/scripts/repair-approved-unpaid-procurement-expense-allocation.ts --apply
 */
import { PrismaClient, TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import { sumConfirmedExpenseAmountKgs } from '../src/procurement/procurement-cost.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const APPROVED = new Set<string>([
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAYMENT_POSTPONED,
  TransportExpenseStatus.PAID,
]);

async function main() {
  const expenses = await prisma.procurementTransportExpense.findMany({
    where: {
      procurementOrderId: { not: null },
      status: { in: Array.from(APPROVED) as TransportExpenseStatus[] },
    },
    select: {
      id: true,
      procurementOrderId: true,
      expenseType: true,
      amount: true,
      currency: true,
      exchangeRate: true,
      amountKgs: true,
      calculatedAmountKgs: true,
      paidAmountKgs: true,
      status: true,
    },
  });

  const byOrder = new Map<string, typeof expenses>();
  for (const row of expenses) {
    if (!row.procurementOrderId) continue;
    const list = byOrder.get(row.procurementOrderId) ?? [];
    list.push(row);
    byOrder.set(row.procurementOrderId, list);
  }

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
        chinaDomesticTransportKgs: true,
        localTransportKgs: true,
        totalCargoCostKgs: true,
        chinaExportTransportKgs: true,
      },
    });
    if (!order) continue;

    const rate =
      order.weightedAverageYuanRate != null && Number(order.totalPaidYuan) > 0
        ? Number(order.weightedAverageYuanRate)
        : Number(order.defaultYuanRate || 0);

    const mapRow = (row: (typeof rows)[number]) => ({
      amount: Number(row.amount),
      currency: row.currency,
      exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
      amountKgs: Number(row.amountKgs || row.calculatedAmountKgs || 0),
      paidAmountKgs: row.paidAmountKgs != null ? Number(row.paidAmountKgs) : null,
      status: row.status,
    });

    const china = sumConfirmedExpenseAmountKgs(
      rows.filter((r) => r.expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT).map(mapRow),
      rate,
    );
    const cargo = sumConfirmedExpenseAmountKgs(
      rows.filter((r) => r.expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT).map(mapRow),
      rate,
    );
    const local = sumConfirmedExpenseAmountKgs(
      rows.filter((r) => r.expenseType === TransportExpenseType.LOCAL_DELIVERY).map(mapRow),
      rate,
    );

    const nextChina = Math.max(china, Number(order.chinaDomesticTransportKgs || 0));
    const nextCargo = Math.max(cargo, Number(order.totalCargoCostKgs || 0), Number(order.chinaExportTransportKgs || 0));
    const nextLocal = Math.max(local, Number(order.localTransportKgs || 0));

    const needsRepair =
      nextChina > Number(order.chinaDomesticTransportKgs || 0) + 0.009 ||
      nextCargo > Number(order.totalCargoCostKgs || 0) + 0.009 ||
      nextLocal > Number(order.localTransportKgs || 0) + 0.009;

    if (!needsRepair) continue;

    repairCount += 1;
    console.log(
      JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        before: {
          chinaDomesticTransportKgs: Number(order.chinaDomesticTransportKgs || 0),
          totalCargoCostKgs: Number(order.totalCargoCostKgs || 0),
          localTransportKgs: Number(order.localTransportKgs || 0),
        },
        after: {
          chinaDomesticTransportKgs: nextChina,
          totalCargoCostKgs: nextCargo,
          chinaExportTransportKgs: nextCargo,
          localTransportKgs: nextLocal,
        },
        apply,
      }),
    );

    if (apply) {
      await prisma.procurementOrder.update({
        where: { id: order.id },
        data: {
          chinaDomesticTransportKgs: nextChina,
          totalCargoCostKgs: nextCargo,
          chinaExportTransportKgs: nextCargo,
          localTransportKgs: nextLocal,
        },
      });
      await prisma.auditLog.create({
        data: {
          action: 'PROCUREMENT_COST_RECALCULATED',
          entity: 'ProcurementOrder',
          entityId: order.id,
          metadata: {
            procurementOrderId: order.id,
            repairScript: 'repair-approved-unpaid-procurement-expense-allocation',
            chinaDomesticTransportKgs: nextChina,
            totalCargoCostKgs: nextCargo,
            localTransportKgs: nextLocal,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
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
