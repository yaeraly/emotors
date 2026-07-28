/**
 * Idempotent repair: align StockMovement.totalCostKgs with ProcurementOrderItem.totalCostKgs
 * for HQ receive movements (authoritative line total, not round(unit)×qty).
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-procurement-movement-line-totals.ts [--order-id=...] [--apply]
 */
import { PrismaClient, StockMovementType } from '@prisma/client';
import { resolveMovementCostUpdates } from '../src/procurement/landed-cost-sync-movements.util';

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

  const orders = await prisma.procurementOrder.findMany({
    where: {
      deletedAt: null,
      ...(args.orderId ? { id: args.orderId } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      items: {
        select: {
          id: true,
          sku: true,
          quantity: true,
          totalCostKgs: true,
          finalCostKgs: true,
        },
      },
    },
    take: args.orderId ? 1 : 500,
  });

  const repairs: Array<Record<string, unknown>> = [];

  for (const order of orders) {
    for (const item of order.items) {
      const lineTotal = n(item.totalCostKgs);
      if (lineTotal <= 0) continue;

      const receivingItems = await prisma.procurementGoodsReceivingItem.findMany({
        where: { procurementItemId: item.id },
        select: { receivingId: true, productId: true },
      });

      const movementIds = new Set<string>();
      for (const receivingItem of receivingItems) {
        const rows = await prisma.stockMovement.findMany({
          where: {
            referenceType: 'PROCUREMENT_GOODS_RECEIVING',
            referenceId: receivingItem.receivingId,
            productId: receivingItem.productId,
            type: StockMovementType.IN,
          },
          select: { id: true, quantity: true, totalCostKgs: true, unitCostKgs: true },
        });
        for (const row of rows) movementIds.add(row.id);
      }

      const movements = await prisma.stockMovement.findMany({
        where: { id: { in: [...movementIds] } },
        select: { id: true, quantity: true, totalCostKgs: true, unitCostKgs: true },
      });

      if (!movements.length) continue;

      const updates = resolveMovementCostUpdates({
        orderLineFinalUnitCostKgs: n(item.finalCostKgs),
        orderLineTotalCostKgs: lineTotal,
        movements: movements.map((movement) => ({
          id: movement.id,
          quantity: movement.quantity,
          totalCostKgs: n(movement.totalCostKgs),
          unitCostKgs: n(movement.unitCostKgs),
        })),
      });

      for (const update of updates) {
        const movement = movements.find((row) => row.id === update.movementId);
        if (!movement) continue;
        const oldTotal = n(movement.totalCostKgs);
        const newTotal = update.totalCostKgs;
        if (Math.abs(oldTotal - newTotal) < 0.009) continue;

        repairs.push({
          orderNumber: order.orderNumber,
          sku: item.sku,
          movementId: update.movementId,
          oldTotalCostKgs: oldTotal,
          newTotalCostKgs: newTotal,
          newUnitCostKgs: update.unitCostKgs,
          procurementLineTotalCostKgs: lineTotal,
        });

        if (args.apply) {
          await prisma.stockMovement.update({
            where: { id: update.movementId },
            data: {
              totalCostKgs: newTotal,
              unitCostKgs: update.unitCostKgs,
            },
          });
          const batch = await prisma.fifoInventoryBatch.findFirst({
            where: { stockMovementId: update.movementId },
            select: { id: true },
          });
          if (batch) {
            await prisma.fifoInventoryBatch.update({
              where: { id: batch.id },
              data: { unitCostKgs: update.unitCostKgs },
            });
          }
        }
      }
    }
  }

  console.log(JSON.stringify({ dryRun: !args.apply, repairCount: repairs.length, repairs }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
