/**
 * Idempotent reconciliation: align product directory cost references and FIFO layers
 * with authoritative oldest-active FIFO landed unit cost (ProcurementLandedCostSnapshot).
 *
 * Usage:
 *   cd apps/api && node --import tsx scripts/reconcile-product-catalog-directory-costs.ts
 *   node --import tsx scripts/reconcile-product-catalog-directory-costs.ts --apply
 *   node --import tsx scripts/reconcile-product-catalog-directory-costs.ts --sku=GEN001 --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  findProductCatalogCostMismatches,
  resolveCurrentProductCatalogUnitCost,
} from '../src/inventory/product-catalog-current-cost.util';
import { roundDisplayMoney } from '../src/pricing/product-cost-precision.util';

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

  const mismatches = await findProductCatalogCostMismatches(prisma, {
    sku: args.sku,
  });

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        mismatchCount: mismatches.length,
        examples: mismatches.slice(0, 25),
      },
      null,
      2,
    ),
  );

  if (!args.apply) {
    await prisma.$disconnect();
    return;
  }

  let movementsUpdated = 0;
  let batchesUpdated = 0;
  let productsUpdated = 0;

  for (const row of mismatches) {
    if (row.expectedFifoCost == null || row.fifoBatchId == null) continue;

    const batch = await prisma.fifoInventoryBatch.findUnique({
      where: { id: row.fifoBatchId },
      select: {
        id: true,
        initialQuantity: true,
        unitCostKgs: true,
        stockMovementId: true,
        referenceType: true,
        referenceId: true,
        productId: true,
      },
    });
    if (!batch) continue;

    const authoritativeUnit = row.expectedFifoCost;
    const snapshotUnit =
      row.snapshotUnitLandedCostKgs != null && row.snapshotUnitLandedCostKgs > 0
        ? row.snapshotUnitLandedCostKgs
        : authoritativeUnit;

    if (batch.stockMovementId) {
      const movement = await prisma.stockMovement.findUnique({
        where: { id: batch.stockMovementId },
        select: {
          id: true,
          quantity: true,
          unitCostKgs: true,
          totalCostKgs: true,
          referenceType: true,
          referenceId: true,
          note: true,
        },
      });
      if (movement) {
        const reconciledUnit = snapshotUnit > 0 ? snapshotUnit : authoritativeUnit;
        const unitCostKgs = reconciledUnit > 0 ? reconciledUnit : authoritativeUnit;
        const receivedQty = Math.abs(n(movement.quantity));
        const newTotal = roundDisplayMoney(unitCostKgs * receivedQty);

        if (
          Math.abs(n(movement.unitCostKgs) - unitCostKgs) > 0.009 ||
          Math.abs(n(movement.totalCostKgs) - newTotal) > 0.009
        ) {
          await prisma.stockMovement.update({
            where: { id: movement.id },
            data: { unitCostKgs, totalCostKgs: newTotal },
          });
          movementsUpdated += 1;
        }
      }
    }

    if (Math.abs(n(batch.unitCostKgs) - snapshotUnit) > 0.009) {
      await prisma.fifoInventoryBatch.update({
        where: { id: batch.id },
        data: { unitCostKgs: snapshotUnit },
      });
      batchesUpdated += 1;
    }

    const resolved = await resolveCurrentProductCatalogUnitCost(prisma, { productId: row.productId });
    if (
      resolved.available &&
      (Math.abs(n(row.storedProductFinalCostKgs) - resolved.costPriceKgs) > 0.01 ||
        Math.abs(n(row.storedProductCostPriceKgs) - resolved.costPriceKgs) > 0.01)
    ) {
      await prisma.product.update({
        where: { id: row.productId },
        data: {
          finalCostKgs: resolved.costPriceKgs,
          costPriceKgs: resolved.costPriceKgs,
        },
      });
      productsUpdated += 1;
    }
  }

  console.log(
    JSON.stringify({
      movementsUpdated,
      batchesUpdated,
      productsUpdated,
    }),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
