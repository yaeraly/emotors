/**
 * Idempotent repair: sync FifoInventoryBatch.unitCostKgs from authoritative
 * StockMovement.totalCostKgs ÷ received quantity for product catalog display.
 *
 * Does NOT change quantities, remainingQuantity, or valid already-matching costs.
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/repair-product-catalog-fifo-display-costs.ts [--sku=SKU] [--apply]
 */
import { PrismaClient, WarehouseType } from '@prisma/client';
import {
  resolveAuthoritativeFifoLayerUnitCost,
} from '../src/pricing/pricing-fifo-unit-cost.util';

type Args = { sku?: string; apply: boolean };

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(args.sku ? { sku: { equals: args.sku, mode: 'insensitive' } } : {}),
    },
    select: { id: true, sku: true, name: true },
    take: args.sku ? 50 : 10000,
  });

  let scanned = 0;
  let drifted = 0;
  let repaired = 0;

  for (const product of products) {
    const batches = await prisma.fifoInventoryBatch.findMany({
      where: {
        productId: product.id,
        warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
      },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    });

    const movementIds = batches
      .map((batch) => batch.stockMovementId)
      .filter((id): id is string => Boolean(id));
    const movements =
      movementIds.length > 0
        ? await prisma.stockMovement.findMany({
            where: { id: { in: movementIds } },
            select: { id: true, quantity: true, unitCostKgs: true, totalCostKgs: true },
          })
        : [];
    const movementById = new Map(movements.map((movement) => [movement.id, movement]));

    for (const batch of batches) {
      scanned += 1;
      const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
      const authoritative = resolveAuthoritativeFifoLayerUnitCost({
        initialQuantity: batch.initialQuantity,
        batchUnitCostKgs: n(batch.unitCostKgs),
        movementQuantity: movement?.quantity,
        movementUnitCostKgs: movement ? n(movement.unitCostKgs) : null,
        movementTotalCostKgs: movement ? n(movement.totalCostKgs) : null,
      });

      if (authoritative <= 0) continue;

      const stored = n(batch.unitCostKgs);
      if (Math.abs(authoritative - stored) <= 0.009) continue;

      drifted += 1;
      console.log(
        JSON.stringify({
          sku: product.sku,
          productId: product.id,
          batchId: batch.id,
          storedUnitCostKgs: stored,
          authoritativeUnitCostKgs: authoritative,
          remainingQuantity: batch.remainingQuantity,
        }),
      );

      if (args.apply) {
        await prisma.fifoInventoryBatch.update({
          where: { id: batch.id },
          data: { unitCostKgs: authoritative },
        });
        repaired += 1;
      }
    }
  }

  console.log(
    JSON.stringify({
      mode: args.apply ? 'apply' : 'dry-run',
      products: products.length,
      batchesScanned: scanned,
      batchesDrifted: drifted,
      batchesRepaired: repaired,
    }),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
