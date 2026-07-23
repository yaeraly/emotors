/**
 * Full verification for SUS001 FIFO fix vs 407.53 aggregate origin.
 *   cd apps/api && npx tsx scripts/verify-sus001-fifo-fix.ts
 */
import { PrismaClient } from '@prisma/client';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';
import { buildFifoAllocationLines } from '../src/pricing/pricing-fifo-allocation.util';
import { resolveUnitCostFromInventoryLayer } from '../src/pricing/pricing-fifo-unit-cost.util';

const p = new PrismaClient();

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const fifo = new PricingFifoService(p as any);
  await fifo.syncFifoBatchesFromHqStockMovements();

  const hqProduct = await p.product.findFirst({
    where: { sku: 'SUS001', deletedAt: null, fifoBatches: { some: {} } },
    orderBy: { createdAt: 'asc' },
  });
  if (!hqProduct) throw new Error('SUS001 HQ product with FIFO not found');

  const catalogProduct = await p.product.findFirst({
    where: { sku: 'SUS001', deletedAt: null, id: { not: hqProduct.id } },
  });

  const balance = await p.inventoryBalance.findFirst({
    where: { productId: hqProduct.id, warehouse: { warehouseType: 'HQ' } },
  });
  const moves = await p.stockMovement.findMany({
    where: { productId: hqProduct.id, type: 'IN' },
    orderBy: { createdAt: 'asc' },
  });
  const batches = await p.fifoInventoryBatch.findMany({
    where: { productId: hqProduct.id },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  const activeCost = await fifo.getOldestActiveHqFifoCost(hqProduct.id);
  const catalogCost = catalogProduct
    ? await fifo.getOldestActiveHqFifoCost(catalogProduct.id)
    : null;

  const target15 = await p.stockMovement.findFirst({
    where: {
      product: { sku: 'SUS001' },
      type: 'IN',
      quantity: 15,
      totalCostKgs: { gte: 24944.5, lte: 24944.6 },
    },
  });
  const target10 = await p.stockMovement.findFirst({
    where: {
      product: { sku: 'SUS001' },
      type: 'IN',
      quantity: 10,
      totalCostKgs: { gte: 16541.9, lte: 16542 },
    },
  });

  const layers = batches
    .filter((b) => b.remainingQuantity > 0)
    .map((b) => ({
      batchId: b.id,
      remainingQuantity: b.remainingQuantity,
      unitLandedCostKgs: n(b.unitCostKgs),
    }));

  const alloc = buildFifoAllocationLines(
    batches
      .filter((b) => b.remainingQuantity > 0)
      .map((b) => ({
        batchId: b.id,
        remainingQuantity: b.remainingQuantity,
        reservedQuantity: b.reservedQuantity,
        unitCostKgs: n(b.unitCostKgs),
      })),
    Math.min(5, batches.reduce((s, b) => s + b.remainingQuantity, 0)),
    { markupPercent: 20, branchType: 'FRANCHISE', subtractReserved: true },
  );

  const avg407 =
    moves.length >= 2
      ? roundMoney(
          moves.reduce((s, m) => s + n(m.totalCostKgs), 0) /
            moves.reduce((s, m) => s + Math.abs(n(m.quantity)), 0),
        )
      : null;

  console.log(
    JSON.stringify(
      {
        verification: {
          oldRecordsProducing40753: moves.map((m, i) => ({
            shipment: i + 1,
            quantity: Math.abs(n(m.quantity)),
            totalLandedCostKgs: n(m.totalCostKgs),
            unitLandedCostKgs: resolveUnitCostFromInventoryLayer({
              quantity: Math.abs(n(m.quantity)),
              totalCostKgs: n(m.totalCostKgs),
            }),
          })),
          weightedAverageFormula: '(80 × 350 + 120 × 445.88) / 200 = 407.53',
          computedWeightedAverage: avg407,
          inventoryBalanceField: balance
            ? { table: 'InventoryBalance', field: 'averageCostKgs', value: n(balance.averageCostKgs) }
            : null,
          productField: {
            table: 'Product',
            field: 'costPriceKgs',
            value: n(hqProduct.costPriceKgs),
            note: 'Aggregate snapshot — must NOT drive catalog/franchise-sales display',
          },
          receipt15Unit: target15
            ? { found: true, movementId: target15.id, productId: target15.productId }
            : { found: false, reason: 'Not in database' },
          receipt10Unit: target10
            ? { found: true, movementId: target10.id, productId: target10.productId }
            : { found: false, reason: 'Not in database' },
          skuProducts: [
            { id: hqProduct.id, role: 'HQ inventory product' },
            catalogProduct ? { id: catalogProduct.id, role: 'catalog twin' } : null,
          ].filter(Boolean),
          fifoLayers: batches.map((b) => ({
            id: b.id,
            receivedQuantity: b.initialQuantity,
            remainingQuantity: b.remainingQuantity,
            unitLandedCostKgs: n(b.unitCostKgs),
          })),
          oldestActiveFifoLayer: activeCost,
          correctDisplayedCost: activeCost.costPriceKgs,
          catalogTwinSameCost: catalogCost?.costPriceKgs,
          crossPageConsistent: activeCost.costPriceKgs === catalogCost?.costPriceKgs,
          not40753: Math.abs(activeCost.costPriceKgs - 407.53) > 0.01,
          branchOrderAllocation: {
            lines: alloc.lines,
            totalCostKgs: alloc.totalCostKgs,
            totalPriceKgs: alloc.totalPriceKgs,
            profitKgs: alloc.profitKgs,
          },
        },
      },
      null,
      2,
    ),
  );

  await p.$disconnect();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
