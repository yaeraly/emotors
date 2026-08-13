/**
 * Repair Pricing Policy / product derived prices for products whose HQ FIFO stock
 * has been fully transferred out (remainingQuantity = 0) and whose live pricing
 * currently collapses to zero because it only looked at active FIFO layers.
 *
 * Recalculates from:
 *   latest valid cost basis (published snapshot → depleted HQ FIFO receipt)
 *   + active product markup rules
 *
 * Does NOT:
 *   - restore sold HQ stock
 *   - create duplicate FIFO layers / pricing rules / snapshots
 *   - mutate inventory movements or historical sales
 *
 * Usage:
 *   cd apps/api
 *   node --import tsx scripts/repair-sold-out-product-pricing.ts \
 *     --product-name="Генератор 5,5 кВт"
 *
 *   node --import tsx scripts/repair-sold-out-product-pricing.ts \
 *     --product-name="Генератор 5,5 кВт" \
 *     --apply
 */
import {
  PrismaClient,
  PricingPolicyVersionStatus,
  WarehouseType,
} from '@prisma/client';
import { pricesFromMarkups } from '../src/pricing/pricing-calculator.util';
import { resolvePricingCostBasis } from '../src/pricing/pricing-cost-basis.util';
import { isSeedStockMovementReference, SEED_FIFO_REFERENCE_TYPE } from '../src/pricing/pricing-fifo-business-layer.util';

function parseArgs(argv: string[]) {
  const nameArg = argv.find((arg) => arg.startsWith('--product-name='));
  const skuArg = argv.find((arg) => arg.startsWith('--sku='));
  return {
    productName: nameArg ? nameArg.slice('--product-name='.length).trim() : undefined,
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

  try {
    const products = await prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(args.sku ? { sku: { equals: args.sku, mode: 'insensitive' as const } } : {}),
        ...(args.productName
          ? { name: { contains: args.productName, mode: 'insensitive' as const } }
          : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        costPriceKgs: true,
        hqBranchWholesaleMarkupPercent: true,
        wholesaleMarkupPercent: true,
        minimumWholesaleMarkupPercent: true,
        masterMarkupPercent: true,
        recommendedRetailMarkupPercent: true,
        minimumSellingMarkupPercent: true,
        hqBranchWholesalePriceKgs: true,
        wholesalePriceKgs: true,
        masterPriceKgs: true,
        recommendedRetailPriceKgs: true,
        minimumSellingPriceKgs: true,
      },
      orderBy: { name: 'asc' },
      take: args.productName || args.sku ? 50 : 500,
    });

    if (!products.length) {
      console.log('No products matched the filter.');
      return;
    }

    const activeVersion = await prisma.pricingPolicyVersion.findFirst({
      where: { status: PricingPolicyVersionStatus.ACTIVE },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true },
    });

    const hqWarehouses = await prisma.warehouse.findMany({
      where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
      select: { id: true },
    });
    const hqWarehouseIds = hqWarehouses.map((row) => row.id);

    const report: Array<Record<string, unknown>> = [];
    let planned = 0;
    let applied = 0;

    for (const product of products) {
      const siblingIds = (
        await prisma.product.findMany({
          where: { sku: product.sku, deletedAt: null },
          select: { id: true },
        })
      ).map((row) => row.id);

      const hqBalances = await prisma.inventoryBalance.findMany({
        where: {
          productId: { in: siblingIds },
          warehouseId: { in: hqWarehouseIds },
        },
        select: { quantity: true, reservedQuantity: true, warehouseId: true },
      });
      const hqQuantity = hqBalances.reduce(
        (sum, row) => sum + Math.max(Number(row.quantity) - Number(row.reservedQuantity ?? 0), 0),
        0,
      );

      const branchBalances = await prisma.inventoryBalance.findMany({
        where: {
          productId: { in: siblingIds },
          warehouse: {
            warehouseType: { not: WarehouseType.HQ },
            deletedAt: null,
            isActive: true,
          },
        },
        select: { quantity: true, reservedQuantity: true },
      });
      const branchQuantity = branchBalances.reduce(
        (sum, row) => sum + Math.max(Number(row.quantity) - Number(row.reservedQuantity ?? 0), 0),
        0,
      );

      const batches = await prisma.fifoInventoryBatch.findMany({
        where: {
          productId: { in: siblingIds },
          warehouseId: { in: hqWarehouseIds },
        },
        select: {
          id: true,
          remainingQuantity: true,
          unitCostKgs: true,
          receivedAt: true,
          referenceType: true,
          referenceId: true,
          stockMovementId: true,
        },
        orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });

      const movementIds = batches
        .map((batch) => batch.stockMovementId)
        .filter((id): id is string => Boolean(id));
      const movements = movementIds.length
        ? await prisma.stockMovement.findMany({
            where: { id: { in: movementIds } },
            select: { id: true, referenceType: true, referenceId: true, note: true },
          })
        : [];
      const movementById = new Map(movements.map((row) => [row.id, row]));

      const layers = batches
        .filter((batch) => {
          if (batch.referenceType === SEED_FIFO_REFERENCE_TYPE) return false;
          const movement = batch.stockMovementId
            ? movementById.get(batch.stockMovementId)
            : null;
          if (
            isSeedStockMovementReference({
              referenceType: batch.referenceType,
              referenceId: batch.referenceId,
              note: movement?.note,
            }) ||
            (movement &&
              isSeedStockMovementReference({
                referenceType: movement.referenceType,
                referenceId: movement.referenceId,
                note: movement.note,
              }))
          ) {
            return false;
          }
          return Number(batch.unitCostKgs) > 0.009;
        })
        .map((batch) => ({
          id: batch.id,
          remainingQuantity: Number(batch.remainingQuantity),
          unitCostKgs: Number(batch.unitCostKgs),
          receivedAt: batch.receivedAt.toISOString(),
        }));

      let snapshotCostKgs: number | null = null;
      let snapshotId: string | null = null;
      if (activeVersion) {
        const snapshot = await prisma.pricingPolicyVersionProductSnapshot.findFirst({
          where: {
            versionId: activeVersion.id,
            productId: { in: siblingIds },
            costPriceKgs: { gt: 0 },
          },
          select: { id: true, costPriceKgs: true },
        });
        if (snapshot) {
          snapshotCostKgs = Number(snapshot.costPriceKgs);
          snapshotId = snapshot.id;
        }
      }

      const costBasis = resolvePricingCostBasis({
        layers,
        snapshotCostKgs,
        snapshotId,
      });

      const markups = {
        wholesaleMarkupPercent: Number(product.wholesaleMarkupPercent),
        minimumWholesaleMarkupPercent: Number(product.minimumWholesaleMarkupPercent),
        hqBranchWholesaleMarkupPercent: Number(product.hqBranchWholesaleMarkupPercent),
        masterMarkupPercent: Number(product.masterMarkupPercent ?? 0),
        recommendedRetailMarkupPercent: Number(product.recommendedRetailMarkupPercent),
        minimumSellingMarkupPercent: Number(product.minimumSellingMarkupPercent),
      };

      const correctPrices = costBasis.available
        ? pricesFromMarkups(costBasis.costPriceKgs, markups)
        : null;

      const stored = {
        retailMinimum: roundMoney(Number(product.minimumSellingPriceKgs)),
        retailRecommended: roundMoney(Number(product.recommendedRetailPriceKgs)),
        retailMaximum: 0,
        masterPrice: roundMoney(Number(product.masterPriceKgs)),
        wholesalePrice: roundMoney(Number(product.wholesalePriceKgs)),
        branchTransferPrice: roundMoney(Number(product.hqBranchWholesalePriceKgs)),
        costPriceKgs: roundMoney(Number(product.costPriceKgs)),
      };

      const correct = correctPrices
        ? {
            retailMinimum: roundMoney(correctPrices.minimumSellingPriceKgs),
            retailRecommended: roundMoney(correctPrices.recommendedRetailPriceKgs),
            retailMaximum: roundMoney(correctPrices.recommendedRetailPriceKgs),
            masterPrice: roundMoney(correctPrices.masterPriceKgs),
            wholesalePrice: roundMoney(correctPrices.wholesalePriceKgs),
            branchTransferPrice: roundMoney(correctPrices.hqBranchWholesalePriceKgs),
            costPriceKgs: roundMoney(costBasis.costPriceKgs),
          }
        : null;

      const needsRepair =
        Boolean(correct) &&
        (stored.retailRecommended <= 0.009 ||
          stored.wholesalePrice <= 0.009 ||
          stored.masterPrice <= 0.009 ||
          stored.branchTransferPrice <= 0.009 ||
          stored.costPriceKgs <= 0.009 ||
          (correct != null && Math.abs(stored.costPriceKgs - correct.costPriceKgs) > 0.009) ||
          (correct != null &&
            Math.abs(stored.retailRecommended - correct.retailRecommended) > 0.009));

      const row = {
        productId: product.id,
        SKU: product.sku,
        productName: product.name,
        hqQuantity: roundMoney(hqQuantity),
        branchQuantity: roundMoney(branchQuantity),
        latestValidCostBasis: costBasis.available ? costBasis.costPriceKgs : null,
        costSource: costBasis.source,
        costSourceRecordId: costBasis.sourceRecordId,
        activePricingPolicyVersionId: activeVersion?.id ?? null,
        storedRetailMinimum: stored.retailMinimum,
        storedRetailRecommended: stored.retailRecommended,
        storedRetailMaximum: stored.retailMaximum,
        storedMasterPrice: stored.masterPrice,
        storedWholesalePrice: stored.wholesalePrice,
        storedBranchTransferPrice: stored.branchTransferPrice,
        storedCostPriceKgs: stored.costPriceKgs,
        correctRetailMinimum: correct?.retailMinimum ?? null,
        correctRetailRecommended: correct?.retailRecommended ?? null,
        correctRetailMaximum: correct?.retailMaximum ?? null,
        correctMasterPrice: correct?.masterPrice ?? null,
        correctWholesalePrice: correct?.wholesalePrice ?? null,
        correctBranchTransferPrice: correct?.branchTransferPrice ?? null,
        correctCostPriceKgs: correct?.costPriceKgs ?? null,
        difference: correct
          ? {
              cost: roundMoney(correct.costPriceKgs - stored.costPriceKgs),
              retailRecommended: roundMoney(correct.retailRecommended - stored.retailRecommended),
              wholesale: roundMoney(correct.wholesalePrice - stored.wholesalePrice),
              master: roundMoney(correct.masterPrice - stored.masterPrice),
            }
          : null,
        plannedChanges: needsRepair,
      };

      report.push(row);

      if (!needsRepair || !correct || !correctPrices) continue;
      planned += 1;

      if (!args.apply) continue;

      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: {
            costPriceKgs: correct.costPriceKgs,
            hqBranchWholesalePriceKgs: correct.branchTransferPrice,
            wholesalePriceKgs: correct.wholesalePrice,
            masterPriceKgs: correct.masterPrice,
            recommendedRetailPriceKgs: correct.retailRecommended,
            minimumSellingPriceKgs: correct.retailMinimum,
          },
        });

        if (activeVersion) {
          await tx.pricingPolicyVersionProductSnapshot.upsert({
            where: {
              versionId_productId: {
                versionId: activeVersion.id,
                productId: product.id,
              },
            },
            create: {
              versionId: activeVersion.id,
              productId: product.id,
              sku: product.sku,
              costPriceKgs: correct.costPriceKgs,
              hqBranchWholesaleMarkupPercent: markups.hqBranchWholesaleMarkupPercent,
              wholesaleMarkupPercent: markups.wholesaleMarkupPercent,
              minimumWholesaleMarkupPercent: markups.minimumWholesaleMarkupPercent,
              masterMarkupPercent: markups.masterMarkupPercent,
              recommendedRetailMarkupPercent: markups.recommendedRetailMarkupPercent,
              minimumSellingMarkupPercent: markups.minimumSellingMarkupPercent,
              hqBranchWholesalePriceKgs: correct.branchTransferPrice,
              wholesalePriceKgs: correct.wholesalePrice,
              minimumWholesalePriceKgs: correctPrices.minimumWholesalePriceKgs,
              masterPriceKgs: correct.masterPrice,
              recommendedRetailPriceKgs: correct.retailRecommended,
              minimumSellingPriceKgs: correct.retailMinimum,
            },
            update: {
              costPriceKgs: correct.costPriceKgs,
              hqBranchWholesalePriceKgs: correct.branchTransferPrice,
              wholesalePriceKgs: correct.wholesalePrice,
              minimumWholesalePriceKgs: correctPrices.minimumWholesalePriceKgs,
              masterPriceKgs: correct.masterPrice,
              recommendedRetailPriceKgs: correct.retailRecommended,
              minimumSellingPriceKgs: correct.retailMinimum,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: null,
            role: 'SYSTEM_ADMINISTRATOR',
            action: 'SOLD_OUT_PRODUCT_PRICING_RECONCILED',
            entity: 'Product',
            entityId: product.id,
            metadata: {
              productId: product.id,
              pricingPolicyVersionId: activeVersion?.id ?? null,
              oldCostBasis: stored.costPriceKgs,
              newCostBasis: correct.costPriceKgs,
              oldPrice: stored.retailRecommended,
              newPrice: correct.retailRecommended,
              sourceRecordId: costBasis.sourceRecordId,
              costSource: costBasis.source,
              reason: 'HQ FIFO remainingQuantity reached 0 after full branch transfer; restore pricing cost basis',
              repairedAt: new Date().toISOString(),
            },
          },
        });
      });

      applied += 1;
    }

    console.log(JSON.stringify({ mode: args.apply ? 'APPLY' : 'DRY_RUN', planned, applied, report }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
