/**
 * Idempotent repair: realign branch distribution order item/order totals with
 * authoritative FIFO allocation line costs (sum of layers, not unit×qty).
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-distribution-order-costs.ts [--order-id=...] [--apply]
 */
import { PrismaClient } from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../src/pricing/product-cost-precision.util';

type Args = { orderId?: string; apply: boolean };

function parseArgs(argv: string[]): Args {
  const orderArg = argv.find((a) => a.startsWith('--order-id='));
  return {
    orderId: orderArg ? orderArg.slice('--order-id='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const orders = await prisma.branchDistributionOrder.findMany({
    where: {
      deletedAt: null,
      ...(args.orderId ? { id: args.orderId } : {}),
      status: { not: 'DRAFT' },
    },
    include: {
      items: {
        include: {
          distributionFifoAllocations: {
            where: { status: { in: ['RESERVED', 'CONSUMED'] } },
          },
        },
      },
      sourceWarehouse: { select: { id: true, warehouseType: true } },
    },
    take: args.orderId ? 1 : 200,
    orderBy: { createdAt: 'asc' },
  });

  const repairs: Array<Record<string, unknown>> = [];

  for (const order of orders) {
    if (order.sourceWarehouse?.warehouseType !== 'HQ') continue;

    const itemUpdates: Array<{
      itemId: string;
      oldTotal: number;
      newTotal: number;
      sku: string;
    }> = [];

    for (const item of order.items) {
      const allocationTotal = sumDisplayMoneyTotals(
        item.distributionFifoAllocations.map((row) => n(row.totalCostKgs)),
      );
      const currentTotal = roundDisplayMoney(n(item.totalCost));
      const nextTotal = allocationTotal > 0 ? allocationTotal : currentTotal;

      if (Math.abs(nextTotal - currentTotal) > 0.001) {
        itemUpdates.push({
          itemId: item.id,
          oldTotal: currentTotal,
          newTotal: nextTotal,
          sku: item.sku,
        });
      }
    }

    const nextOrderTotal = sumDisplayMoneyTotals(
      order.items.map((item) => {
        const allocationTotal = sumDisplayMoneyTotals(
          item.distributionFifoAllocations.map((row) => n(row.totalCostKgs)),
        );
        return allocationTotal > 0 ? allocationTotal : n(item.totalCost);
      }),
    );
    const oldOrderTotal = roundDisplayMoney(n(order.totalCost));

    if (Math.abs(nextOrderTotal - oldOrderTotal) <= 0.001) continue;

    repairs.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      oldOrderTotal,
      newOrderTotal,
      difference: roundDisplayMoney(nextOrderTotal - oldOrderTotal),
      itemUpdates,
    });

    if (!args.apply) continue;

    await prisma.$transaction(async (tx) => {
      for (const update of itemUpdates) {
        const item = order.items.find((row) => row.id === update.itemId);
        if (!item) continue;
        const quantity = n(item.quantity);
        await tx.branchDistributionOrderItem.update({
          where: { id: update.itemId },
          data: {
            totalCost: update.newTotal,
            unitCost: quantity > 0 ? deriveDisplayUnitCost(update.newTotal, quantity) : 0,
          },
        });
      }

      const refreshedItems = await tx.branchDistributionOrderItem.findMany({
        where: { orderId: order.id },
      });
      const totalAmount = sumDisplayMoneyTotals(refreshedItems.map((row) => n(row.totalPrice)));
      const totalCost = sumDisplayMoneyTotals(refreshedItems.map((row) => n(row.totalCost)));

      await tx.branchDistributionOrder.update({
        where: { id: order.id },
        data: {
          totalAmount,
          totalCost,
          totalProfit: roundDisplayMoney(totalAmount - totalCost),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: 'system',
          role: 'SYSTEM_ADMINISTRATOR',
          action: 'COST_RECONCILIATION_CORRECTED',
          entity: 'BranchDistributionOrder',
          entityId: order.id,
          metadata: {
            shipmentId: null,
            warehouseId: order.sourceWarehouseId,
            branchOrderId: order.id,
            oldTotal: oldOrderTotal,
            newTotal: totalCost,
            difference: roundDisplayMoney(totalCost - oldOrderTotal),
            reason: 'Reconcile branch order transfer cost with FIFO allocation line totals',
            correctedBy: 'repair-distribution-order-costs',
            correctedAt: new Date().toISOString(),
            itemUpdates,
          },
        },
      });
    });
  }

  console.log(
    JSON.stringify(
      {
        apply: args.apply,
        ordersChecked: orders.length,
        repairsFound: repairs.length,
        repairs,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
