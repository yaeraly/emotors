/**
 * Reconcile Product Catalog reference cost with latest Supply Manager receipt cost.
 * Updates Product.costPriceKgs only — never FIFO batch unit costs or quantities.
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/repair-product-catalog-reference-costs.ts
 *   npx tsx scripts/repair-product-catalog-reference-costs.ts --apply
 *   npx tsx scripts/repair-product-catalog-reference-costs.ts --sku=GEN001 --apply
 */
import { PrismaClient, WarehouseType } from '@prisma/client';
import { getLatestReceivedUnitLandedCost } from '../src/inventory/product-catalog-purchase-cost.util';

function parseArgs(argv: string[]) {
  const skuArg = argv.find((arg) => arg.startsWith('--sku='));
  return {
    sku: skuArg ? skuArg.slice('--sku='.length).trim() : undefined,
    apply: argv.includes('--apply'),
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const hqWarehouse = await prisma.warehouse.findFirst({
    where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(args.sku ? { sku: { equals: args.sku, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      costPriceKgs: true,
      finalCostKgs: true,
    },
    orderBy: { sku: 'asc' },
  });

  const report: Array<Record<string, unknown>> = [];
  let updatedCount = 0;
  let matchedCount = 0;
  let skippedCount = 0;

  for (const product of products) {
    const latest = await getLatestReceivedUnitLandedCost(prisma, {
      productId: product.id,
      ...(hqWarehouse ? { warehouseId: hqWarehouse.id } : {}),
    });

    const oldCatalogCost = roundMoney(Number(product.costPriceKgs));
    const supplyManagerCost = latest.available
      ? roundMoney(latest.latestReceivedUnitLandedCost)
      : null;

    if (!supplyManagerCost || supplyManagerCost <= 0) {
      skippedCount += 1;
      report.push({
        productCode: product.sku,
        productName: product.name,
        oldCatalogCost,
        supplyManagerLandedCost: null,
        newCatalogCost: oldCatalogCost,
        result: 'SKIPPED_NO_RECEIPT',
      });
      continue;
    }

    const needsUpdate = Math.abs(oldCatalogCost - supplyManagerCost) > 0.009;
    const newCatalogCost = supplyManagerCost;

    if (!needsUpdate) {
      matchedCount += 1;
      report.push({
        productCode: product.sku,
        productName: product.name,
        oldCatalogCost,
        supplyManagerLandedCost: supplyManagerCost,
        newCatalogCost,
        result: 'MATCH',
      });
      continue;
    }

    if (args.apply) {
      await prisma.product.update({
        where: { id: product.id },
        data: { costPriceKgs: newCatalogCost },
      });
      updatedCount += 1;
    }

    report.push({
      productCode: product.sku,
      productName: product.name,
      oldCatalogCost,
      supplyManagerLandedCost: supplyManagerCost,
      newCatalogCost,
      result: args.apply ? 'UPDATED' : 'WOULD_UPDATE',
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        hqWarehouse,
        productsScanned: products.length,
        summary: {
          updatedCount,
          matchedCount,
          skippedCount,
          wouldUpdateCount: report.filter((row) => row.result === 'WOULD_UPDATE').length,
        },
        report,
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
