/**
 * Idempotent repair: align HQ InventoryBalance valuation with remaining active FIFO layers.
 * Dry-run by default. Does not change quantities, movements, receipts, transfers, or FIFO layers.
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-hq-inventory-fifo-parity.ts
 *   node --import tsx scripts/repair-hq-inventory-fifo-parity.ts --warehouse-id=...
 *   node --import tsx scripts/repair-hq-inventory-fifo-parity.ts --apply
 */
import { PrismaClient, WarehouseType } from '@prisma/client';
import {
  compareWarehouseInventoryValuation,
  inspectWarehouseFifoBalanceParity,
  syncInventoryBalanceValuationFromFifoRemainingInTx,
  sumWarehouseFifoRemainingValueKgs,
} from '../src/inventory/inventory-authoritative-value.util';
import {
  computeLayerRemainingCostKgs,
  roundDisplayMoney,
} from '../src/pricing/product-cost-precision.util';

type Args = { warehouseId?: string; apply: boolean };

function parseArgs(argv: string[]): Args {
  const warehouseArg = argv.find((a) => a.startsWith('--warehouse-id='));
  return {
    warehouseId: warehouseArg ? warehouseArg.slice('--warehouse-id='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const warehouses = await prisma.warehouse.findMany({
    where: {
      deletedAt: null,
      warehouseType: WarehouseType.HQ,
      branchId: null,
      ...(args.warehouseId ? { id: args.warehouseId } : {}),
    },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

  const repairs: Array<Record<string, unknown>> = [];
  const warehouseSummaries: Array<Record<string, unknown>> = [];

  for (const warehouse of warehouses) {
    const before = await compareWarehouseInventoryValuation(prisma, warehouse.id);
    const inspection = await inspectWarehouseFifoBalanceParity(prisma, warehouse.id);
    const fifoTotal = await sumWarehouseFifoRemainingValueKgs(prisma, warehouse.id);

    const batches = await prisma.fifoInventoryBatch.findMany({
      where: { warehouseId: warehouse.id },
      include: {
        product: { select: { sku: true } },
      },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    });
    const movementIds = batches
      .map((batch) => batch.stockMovementId)
      .filter((id): id is string => Boolean(id));
    const movements = movementIds.length
      ? await prisma.stockMovement.findMany({
          where: { id: { in: movementIds } },
          select: { id: true, totalCostKgs: true, quantity: true },
        })
      : [];
    const movementById = new Map(movements.map((row) => [row.id, row]));

    for (const batch of batches) {
      const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
      const originalQuantity = Math.max(
        Number(batch.initialQuantity),
        Math.abs(Number(movement?.quantity ?? 0)),
        Number(batch.remainingQuantity),
      );
      const remainingQuantity = Math.max(0, Number(batch.remainingQuantity));
      const originalValue = roundDisplayMoney(
        Number(movement?.totalCostKgs ?? 0) > 0
          ? Number(movement?.totalCostKgs)
          : Number(batch.unitCostKgs) * originalQuantity,
      );
      const correctRemainingValue =
        remainingQuantity <= 0
          ? 0
          : computeLayerRemainingCostKgs(originalValue, originalQuantity, remainingQuantity);
      const consumedValue = roundDisplayMoney(originalValue - correctRemainingValue);
      const storedRemainingValue = remainingQuantity > 0 ? correctRemainingValue : 0;

      if (remainingQuantity <= 0 && originalValue > 0) {
        repairs.push({
          recordType: 'fifo_layer_consumed',
          warehouseId: warehouse.id,
          productId: batch.productId,
          sku: batch.product.sku,
          fifoLayerId: batch.id,
          originalQuantity,
          remainingQuantity,
          originalValue,
          consumedValue,
          storedRemainingValue: 0,
          correctRemainingValue: 0,
          difference: 0,
          reason: 'fully_consumed_excluded_from_hq_valuation',
        });
      }
    }

    const stale = inspection.issues.filter((issue) => issue.reason === 'STALE_BALANCE_VALUE');
    for (const issue of stale) {
      const balance = await prisma.inventoryBalance.findFirst({
        where: { warehouseId: warehouse.id, productId: issue.productId },
        include: { product: { select: { sku: true } } },
      });
      if (!balance) continue;

      let nextTotal = issue.fifoRemainingValueKgs;
      if (args.apply) {
        const synced = await prisma.$transaction((tx) =>
          syncInventoryBalanceValuationFromFifoRemainingInTx(tx, {
            warehouseId: warehouse.id,
            productId: issue.productId,
            branchId: balance.branchId,
          }),
        );
        nextTotal = synced?.newTotalValueKgs ?? nextTotal;
        if (synced?.changed) {
          await prisma.auditLog.create({
            data: {
              userId: null,
              role: 'SYSTEM',
              action: 'FIFO_REMAINING_VALUE_RECONCILED',
              entity: 'InventoryBalance',
              entityId: synced.balanceId,
              metadata: {
                warehouseId: warehouse.id,
                productId: issue.productId,
                oldRemainingValue: synced.oldTotalValueKgs,
                correctedRemainingValue: synced.newTotalValueKgs,
                difference: roundDisplayMoney(synced.newTotalValueKgs - synced.oldTotalValueKgs),
                reason: 'repair_hq_inventory_fifo_parity_script',
                repairedBy: 'repair-hq-inventory-fifo-parity',
                repairedAt: new Date().toISOString(),
              },
            },
          });
          await prisma.auditLog.create({
            data: {
              userId: null,
              role: 'SYSTEM',
              action: 'HQ_INVENTORY_FIFO_PARITY_REPAIRED',
              entity: 'Warehouse',
              entityId: warehouse.id,
              metadata: {
                warehouseId: warehouse.id,
                productId: issue.productId,
                balanceId: synced.balanceId,
                oldRemainingValue: synced.oldTotalValueKgs,
                correctedRemainingValue: synced.newTotalValueKgs,
                difference: roundDisplayMoney(synced.newTotalValueKgs - synced.oldTotalValueKgs),
                reason: 'repair_hq_inventory_fifo_parity_script',
                repairedBy: 'repair-hq-inventory-fifo-parity',
                repairedAt: new Date().toISOString(),
              },
            },
          });
        }
      }

      repairs.push({
        recordType: 'inventory_balance',
        warehouseId: warehouse.id,
        productId: issue.productId,
        sku: balance.product.sku,
        fifoLayerId: null,
        originalQuantity: null,
        remainingQuantity: issue.fifoRemainingQuantity,
        originalValue: null,
        consumedValue: null,
        storedRemainingValue: issue.balanceValueKgs,
        correctRemainingValue: nextTotal,
        difference: roundDisplayMoney(nextTotal - issue.balanceValueKgs),
        reason: 'stale_balance_value_after_fifo_consumption',
      });
    }

    const after = args.apply
      ? await compareWarehouseInventoryValuation(prisma, warehouse.id)
      : before;

    warehouseSummaries.push({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      fifoRemainingActiveKgs: fifoTotal,
      balanceOnHandBeforeKgs: before.balanceTotalKgs,
      balanceOnHandAfterKgs: after.balanceTotalKgs,
      valuationMismatchBeforeKgs: before.differenceKgs,
      valuationMismatchAfterKgs: after.differenceKgs,
      blockingIssues: inspection.issues.filter((i) => i.reason !== 'STALE_BALANCE_VALUE'),
      staleBalanceProducts: stale.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        filters: { warehouseId: args.warehouseId ?? null },
        warehouseSummaries,
        repairSummary: {
          rowsReported: repairs.length,
          totalBalanceValueDeltaKgs: roundDisplayMoney(
            repairs
              .filter((row) => row.recordType === 'inventory_balance')
              .reduce((sum, row) => sum + n(row.difference), 0),
          ),
        },
        repairs: repairs.slice(0, 1000),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
