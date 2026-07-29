/**
 * Idempotent repair: align StockMovement.totalCostKgs with ProcurementOrderItem.totalCostKgs
 * for HQ receive movements (authoritative line total, not round(unit)×qty).
 * Also recomputes InventoryBalance.totalValueKgs from movement line totals.
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-procurement-movement-line-totals.ts [--order-id=...] [--apply]
 */
import { PrismaClient, StockMovementType } from '@prisma/client';
import { recomputeInventoryBalanceValuationInTx } from '../src/inventory/inventory-balance-valuation.repair';
import { resolveMovementCostUpdates } from '../src/procurement/landed-cost-sync-movements.util';
import { planProcurementReceiveInventoryReconciliation } from '../src/procurement/procurement-receive-inventory-reconcile.util';

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
      totalCostKgs: true,
      hqWarehouseId: true,
      items: {
        select: {
          id: true,
          sku: true,
          productId: true,
          quantity: true,
          totalCostKgs: true,
          finalCostKgs: true,
        },
      },
    },
    take: args.orderId ? 1 : 500,
  });

  const repairs: Array<Record<string, unknown>> = [];
  const balanceKeys = new Set<string>();

  for (const order of orders) {
    const movementSnapshots: Array<{
      movementId: string;
      productId: string;
      warehouseId: string;
      branchId: string;
      quantity: number;
      totalCostKgs: number;
    }> = [];

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
          select: {
            id: true,
            branchId: true,
            warehouseId: true,
            quantity: true,
            totalCostKgs: true,
            unitCostKgs: true,
          },
        });
        for (const row of rows) {
          movementIds.add(row.id);
          movementSnapshots.push({
            movementId: row.id,
            productId: receivingItem.productId,
            warehouseId: row.warehouseId,
            branchId: row.branchId,
            quantity: Math.abs(n(row.quantity)),
            totalCostKgs: n(row.totalCostKgs),
          });
        }
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

    if (!movementSnapshots.length) continue;

    const reconciliationPlan = planProcurementReceiveInventoryReconciliation(
      movementSnapshots.map((row) => ({
        movementId: row.movementId,
        productId: row.productId,
        warehouseId: row.warehouseId,
        branchId: row.branchId,
        quantity: row.quantity,
        totalCostKgs: row.totalCostKgs,
      })),
      n(order.totalCostKgs),
    );

    for (const plan of reconciliationPlan) {
      if (Math.abs(plan.deltaKgs) < 0.009) continue;
      repairs.push({
        orderNumber: order.orderNumber,
        movementId: plan.movementId,
        reconciliationDeltaKgs: plan.deltaKgs,
        reconciledTotalCostKgs: plan.reconciledTotalCostKgs,
      });
      if (args.apply) {
        await prisma.stockMovement.update({
          where: { id: plan.movementId },
          data: {
            totalCostKgs: plan.reconciledTotalCostKgs,
            unitCostKgs: plan.reconciledUnitCostKgs,
          },
        });
        const batch = await prisma.fifoInventoryBatch.findFirst({
          where: { stockMovementId: plan.movementId },
          select: { id: true },
        });
        if (batch) {
          await prisma.fifoInventoryBatch.update({
            where: { id: batch.id },
            data: { unitCostKgs: plan.reconciledUnitCostKgs },
          });
        }
      }
    }

    for (const snap of movementSnapshots) {
      balanceKeys.add(`${snap.branchId}:${snap.warehouseId}:${snap.productId}`);
    }
  }

  const balanceRepairs: Array<Record<string, unknown>> = [];
  if (args.apply) {
    for (const key of balanceKeys) {
      const [branchId, warehouseId, productId] = key.split(':');
      await prisma.$transaction(async (tx) => {
        const before = await tx.inventoryBalance.findUnique({
          where: {
            branchId_warehouseId_productId: { branchId, warehouseId, productId },
          },
          select: { totalValueKgs: true },
        });
        const after = await recomputeInventoryBalanceValuationInTx(tx, {
          branchId,
          warehouseId,
          productId,
        });
        if (before && after) {
          const oldValue = n(before.totalValueKgs);
          const newValue = after.totalValueKgs;
          if (Math.abs(oldValue - newValue) >= 0.009) {
            balanceRepairs.push({
              branchId,
              warehouseId,
              productId,
              oldTotalValueKgs: oldValue,
              newTotalValueKgs: newValue,
            });
          }
        }
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !args.apply,
        movementRepairCount: repairs.length,
        balanceRepairCount: balanceRepairs.length,
        movementRepairs: repairs,
        balanceRepairs,
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
