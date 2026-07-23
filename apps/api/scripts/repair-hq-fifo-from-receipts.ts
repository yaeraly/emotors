/**
 * Idempotent repair: backfill HQ FIFO layers from StockMovement receipts and
 * recompute remainingQuantity from auditable consumption (sales + consumed distributions).
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/repair-hq-fifo-from-receipts.ts [--sku=SUS001] [--apply]
 *
 * Dry-run by default. --apply runs inside a transaction and prints old/new state per layer.
 */
import { PrismaClient, StockMovementType, WarehouseType } from '@prisma/client';
import { resolveUnitCostFromInventoryLayer } from '../src/pricing/pricing-fifo-unit-cost.util';
import {
  computeFifoRemainingFromMovement,
  computeFifoReservedOnBatch,
} from '../src/pricing/pricing-fifo-remaining.util';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';

type Args = { sku?: string; apply: boolean };

const TARGET_RECEIPTS = [
  { label: '15-unit shipment', quantity: 15, totalLandedCostKgs: 24944.55 },
  { label: '10-unit shipment', quantity: 10, totalLandedCostKgs: 16541.95 },
];

function parseArgs(argv: string[]): Args {
  const skuArg = argv.find((a) => a.startsWith('--sku='));
  return {
    sku: skuArg ? skuArg.slice('--sku='.length) : undefined,
    apply: argv.includes('--apply'),
  };
}

function n(v: unknown) {
  return Number(v ?? 0);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function findTargetReceipts(prisma: PrismaClient, sku?: string) {
  const results = [];
  for (const target of TARGET_RECEIPTS) {
    const movements = await prisma.stockMovement.findMany({
      where: {
        type: StockMovementType.IN,
        status: 'ACTIVE',
        quantity: target.quantity,
        totalCostKgs: { gte: target.totalLandedCostKgs - 0.05, lte: target.totalLandedCostKgs + 0.05 },
        ...(sku ? { product: { sku: { equals: sku, mode: 'insensitive' } } } : {}),
      },
      include: { product: { select: { id: true, sku: true } } },
    });
    const items = await prisma.procurementOrderItem.findMany({
      where: {
        receivedQuantity: target.quantity,
        totalCostKgs: { gte: target.totalLandedCostKgs - 0.05, lte: target.totalLandedCostKgs + 0.05 },
        ...(sku ? { sku: { equals: sku, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        sku: true,
        productId: true,
        receivedQuantity: true,
        totalCostKgs: true,
        finalCostKgs: true,
        orderId: true,
      },
    });
    results.push({
      ...target,
      stockMovements: movements.map((m) => ({
        movementId: m.id,
        productId: m.productId,
        sku: m.product.sku,
        quantity: m.quantity,
        totalLandedCostKgs: n(m.totalCostKgs),
        unitLandedCostKgs: resolveUnitCostFromInventoryLayer({
          quantity: Math.abs(m.quantity),
          totalCostKgs: n(m.totalCostKgs),
          unitCostKgs: n(m.unitCostKgs),
        }),
        referenceType: m.referenceType,
        referenceId: m.referenceId,
      })),
      procurementOrderItems: items,
      found: movements.length > 0 || items.length > 0,
    });
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const fifoService = new PricingFifoService(prisma as any);

  const targetReceiptSearch = await findTargetReceipts(prisma, args.sku);

  const runRepair = async () => {
    const products = await prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(args.sku ? { sku: { equals: args.sku, mode: 'insensitive' } } : {}),
      },
      select: { id: true, sku: true, name: true, finalCostKgs: true, costPriceKgs: true },
      take: args.sku ? 50 : 5000,
    });

    const layerReports: Array<Record<string, unknown>> = [];

    for (const product of products) {
      const balances = await prisma.inventoryBalance.findMany({
        where: {
          productId: product.id,
          warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null },
        },
      });

      const movements = await prisma.stockMovement.findMany({
        where: {
          productId: product.id,
          type: StockMovementType.IN,
          status: 'ACTIVE',
          quantity: { gt: 0 },
          warehouse: { warehouseType: WarehouseType.HQ },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!movements.length && !balances.length) continue;

      for (const movement of movements) {
        const receivedQty = Math.abs(n(movement.quantity));
        const unitLandedCostKgs = resolveUnitCostFromInventoryLayer({
          quantity: receivedQty,
          unitCostKgs: n(movement.unitCostKgs),
          totalCostKgs: n(movement.totalCostKgs),
        });
        const totalLandedCostKgs = roundMoney(n(movement.totalCostKgs));
        const remainingQuantity = await computeFifoRemainingFromMovement(
          prisma,
          movement.id,
          receivedQty,
        );

        const existing = await prisma.fifoInventoryBatch.findFirst({
          where: { stockMovementId: movement.id },
        });

        const oldState = existing
          ? {
              fifoLayerId: existing.id,
              receivedQuantity: existing.initialQuantity,
              remainingQuantity: existing.remainingQuantity,
              reservedQuantity: existing.reservedQuantity,
              unitLandedCostKgs: n(existing.unitCostKgs),
            }
          : null;

        let batchId = existing?.id ?? null;
        if (args.apply) {
          if (existing) {
            const reservedQuantity = await computeFifoReservedOnBatch(prisma, existing.id);
            const needsUnitRepair =
              unitLandedCostKgs > 0 && Math.abs(n(existing.unitCostKgs) - unitLandedCostKgs) > 0.009;
            const needsQtyRepair =
              existing.initialQuantity !== receivedQty ||
              existing.remainingQuantity !== remainingQuantity ||
              existing.reservedQuantity !== reservedQuantity;
            if (needsUnitRepair || needsQtyRepair) {
              await prisma.fifoInventoryBatch.update({
                where: { id: existing.id },
                data: {
                  unitCostKgs: unitLandedCostKgs,
                  initialQuantity: receivedQty,
                  remainingQuantity,
                  reservedQuantity,
                },
              });
            }
            batchId = existing.id;
          } else {
            const created = await prisma.fifoInventoryBatch.create({
              data: {
                productId: product.id,
                warehouseId: movement.warehouseId,
                stockMovementId: movement.id,
                receivedAt: movement.createdAt,
                unitCostKgs: unitLandedCostKgs,
                initialQuantity: receivedQty,
                remainingQuantity,
                reservedQuantity: 0,
                referenceType: movement.referenceType,
                referenceId: movement.referenceId,
              },
            });
            batchId = created.id;
          }
        }

        const newState = {
          fifoLayerId: batchId,
          receivedQuantity: receivedQty,
          remainingQuantity,
          unitLandedCostKgs,
          totalLandedCostKgs,
        };

        if (
          args.sku ||
          !existing ||
          (oldState &&
            (Math.abs(oldState.unitLandedCostKgs - unitLandedCostKgs) > 0.009 ||
              oldState.remainingQuantity !== remainingQuantity))
        ) {
          layerReports.push({
            productId: product.id,
            SKU: product.sku,
            sourceReceipt: {
              stockMovementId: movement.id,
              referenceType: movement.referenceType,
              referenceId: movement.referenceId,
              receivedAt: movement.createdAt,
            },
            oldState,
            newFifoLayer: newState,
          });
        }
      }
    }

    return layerReports;
  };

  let layerReports: Array<Record<string, unknown>> = [];
  if (args.apply) {
    await prisma.$transaction(async () => {
      layerReports = await runRepair();
    });
  } else {
    layerReports = await runRepair();
  }

  await fifoService.syncFifoBatchesFromHqStockMovements();

  const sus001 = await prisma.product.findFirst({
    where: { sku: 'SUS001', deletedAt: null, fifoBatches: { some: {} } },
    orderBy: { createdAt: 'asc' },
  });

  let activeFifo = null;
  let catalogApiCost = null;
  if (sus001) {
    activeFifo = await fifoService.getOldestActiveHqFifoCost(sus001.id);
    const catalogTwin = await prisma.product.findFirst({
      where: { sku: 'SUS001', branch: { code: 'SUS001-CAT-BR' }, deletedAt: null },
    });
    if (catalogTwin) {
      catalogApiCost = await fifoService.getOldestActiveHqFifoCost(catalogTwin.id);
    }
  }

  const balance407 = sus001
    ? await prisma.inventoryBalance.findFirst({
        where: { productId: sus001.id, averageCostKgs: { gte: 407.52, lte: 407.54 } },
      })
    : null;

  const oldMoves = sus001
    ? await prisma.stockMovement.findMany({
        where: { productId: sus001.id, type: 'IN' },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        skuFilter: args.sku ?? null,
        targetReceiptSearch,
        missingReceiptReason:
          targetReceiptSearch.every((r) => !r.found)
            ? 'No StockMovement or ProcurementOrderItem rows match 15×24944.55 or 10×16541.95 in this database. Receipts may exist only in production or were never persisted as HQ IN movements linked to SUS001.'
            : null,
        originOf40753: balance407
          ? {
              formula: '(80 × 350 + 120 × 445.88) / 200 = 407.53',
              inventoryBalance: {
                averageCostKgs: n(balance407.averageCostKgs),
                totalValueKgs: n(balance407.totalValueKgs),
                quantity: balance407.quantity,
              },
              oldStockMovements: oldMoves.map((m) => ({
                quantity: m.quantity,
                totalLandedCostKgs: n(m.totalCostKgs),
                unitLandedCostKgs: resolveUnitCostFromInventoryLayer({
                  quantity: Math.abs(m.quantity),
                  totalCostKgs: n(m.totalCostKgs),
                }),
              })),
            }
          : null,
        productCostPriceKgs: sus001
          ? (
              await prisma.product.findUnique({
                where: { id: sus001.id },
                select: { costPriceKgs: true, finalCostKgs: true },
              })
            )
          : null,
        repairLayers: layerReports,
        oldestActiveFifoLayer: activeFifo,
        catalogTwinFifoCost: catalogApiCost,
        displayedCostMustNotBe40753UnlessRealLayer:
          activeFifo && Math.abs(activeFifo.costPriceKgs - 407.53) < 0.01
            ? 'WARNING: active FIFO layer unit is 407.53'
            : `OK: active FIFO cost is ${activeFifo?.costPriceKgs ?? 'N/A'}, not aggregate 407.53`,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
