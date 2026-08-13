/**
 * Diagnose and repair stale HQ Product Catalog FIFO costs.
 *
 * Dry-run by default. Does NOT change quantities, recreate receipts/FIFO/movements/transfers,
 * or change selling prices.
 *
 * Usage:
 *   cd apps/api
 *   node --import tsx scripts/repair-hq-product-fifo-cost.ts \
 *     --product-name="Амортизатор 43×72 (Ø1,5 см)"
 *   node --import tsx scripts/repair-hq-product-fifo-cost.ts \
 *     --product-name="Амортизатор 43×72 (Ø1,5 см)" --apply
 *   node --import tsx scripts/repair-hq-product-fifo-cost.ts --all
 *   node --import tsx scripts/repair-hq-product-fifo-cost.ts --sku=SUS001 --apply
 */
import { Prisma, PrismaClient, WarehouseType } from '@prisma/client';
import {
  resolveCurrentProductCatalogUnitCost,
  resolveFifoLayerCatalogUnitCost,
} from '../src/inventory/product-catalog-current-cost.util';
import { roundDisplayMoney } from '../src/pricing/product-cost-precision.util';

type Args = {
  productName?: string;
  sku?: string;
  all: boolean;
  apply: boolean;
};

const STALE_PURCHASE_ONLY_HINT = 309.78;

function parseArgs(argv: string[]): Args {
  const nameArg = argv.find((a) => a.startsWith('--product-name='));
  const skuArg = argv.find((a) => a.startsWith('--sku='));
  return {
    productName: nameArg ? nameArg.slice('--product-name='.length) : undefined,
    sku: skuArg ? skuArg.slice('--sku='.length) : undefined,
    all: argv.includes('--all'),
    apply: argv.includes('--apply'),
  };
}

function n(value: unknown) {
  return Number(value ?? 0);
}

function nearly(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

async function diagnoseProduct(
  prisma: PrismaClient,
  product: {
    id: string;
    sku: string;
    name: string;
    finalCostKgs: Prisma.Decimal | number;
    costPriceKgs: Prisma.Decimal | number;
    purchaseCostKgs: Prisma.Decimal | number;
  },
) {
  const hqWarehouse = await prisma.warehouse.findFirst({
    where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });

  const balance = hqWarehouse
    ? await prisma.inventoryBalance.findFirst({
        where: { productId: product.id, warehouseId: hqWarehouse.id },
      })
    : null;

  const batches = await prisma.fifoInventoryBatch.findMany({
    where: {
      productId: product.id,
      warehouse: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
    },
    include: {
      warehouse: { select: { id: true, name: true, warehouseType: true } },
    },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  const movementIds = batches
    .map((batch) => batch.stockMovementId)
    .filter((id): id is string => Boolean(id));
  const movements =
    movementIds.length > 0
      ? await prisma.stockMovement.findMany({
          where: { id: { in: movementIds } },
          select: {
            id: true,
            quantity: true,
            unitCostKgs: true,
            totalCostKgs: true,
            referenceType: true,
            referenceId: true,
            note: true,
          },
        })
      : [];
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));

  const layerReports = [];
  for (const batch of batches) {
    const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) ?? null : null;
    const catalogUnit = await resolveFifoLayerCatalogUnitCost(prisma, batch, movement);
    layerReports.push({
      fifoLayerId: batch.id,
      warehouseId: batch.warehouseId,
      warehouseName: batch.warehouse.name,
      receivedAt: batch.receivedAt,
      initialQuantity: batch.initialQuantity,
      remainingQuantity: batch.remainingQuantity,
      storedBatchUnitCostKgs: n(batch.unitCostKgs),
      movementUnitCostKgs: movement ? n(movement.unitCostKgs) : null,
      movementTotalCostKgs: movement ? n(movement.totalCostKgs) : null,
      catalogResolvedUnitCostKgs: catalogUnit,
      referenceType: batch.referenceType,
      referenceId: batch.referenceId,
      stockMovementId: batch.stockMovementId,
      isActiveRemaining: batch.remainingQuantity > 0,
    });
  }

  const activeLayers = layerReports.filter((layer) => layer.isActiveRemaining);
  const consumedLayers = layerReports.filter((layer) => !layer.isActiveRemaining);
  const firstShipment = layerReports[0] ?? null;
  const secondShipment = layerReports[1] ?? null;

  const resolved = await resolveCurrentProductCatalogUnitCost(prisma, {
    productId: product.id,
    warehouseId: hqWarehouse?.id,
  });

  const storedCatalogCost =
    n(product.finalCostKgs) > 0
      ? n(product.finalCostKgs)
      : n(product.costPriceKgs) > 0
        ? n(product.costPriceKgs)
        : n(product.purchaseCostKgs);

  const storedInventoryBalanceCost = balance ? n(balance.averageCostKgs) : null;
  const correctDisplayedCost = resolved.available ? resolved.costPriceKgs : null;
  const currentDisplayedCost = storedCatalogCost;

  let incorrectSource:
    | {
        sourceTable: string;
        sourceRecordId: string | null;
        sourceField: string;
        value: number;
        calculation: string;
        whySelected: string;
        whyInvalid: string;
      }
    | null = null;

  if (nearly(storedCatalogCost, STALE_PURCHASE_ONLY_HINT)) {
    incorrectSource = {
      sourceTable: 'Product',
      sourceRecordId: product.id,
      sourceField:
        nearly(n(product.purchaseCostKgs), STALE_PURCHASE_ONLY_HINT)
          ? 'purchaseCostKgs'
          : nearly(n(product.costPriceKgs), STALE_PURCHASE_ONLY_HINT)
            ? 'costPriceKgs'
            : 'finalCostKgs',
      value: STALE_PURCHASE_ONLY_HINT,
      calculation:
        'Stale Product snapshot (typically purchasePriceYuan × yuanRate without allocated China transport/landed costs)',
      whySelected:
        'Product Catalog previously fell back to / persisted a non-FIFO product cost field instead of the oldest active HQ FIFO layer',
      whyInvalid:
        'Does not match any authoritative China shipment landed unit cost (1636.13 / 1662.97) and ignores active FIFO remainingQuantity > 0',
    };
  } else if (
    storedInventoryBalanceCost != null &&
    nearly(storedInventoryBalanceCost, STALE_PURCHASE_ONLY_HINT)
  ) {
    incorrectSource = {
      sourceTable: 'InventoryBalance',
      sourceRecordId: balance?.id ?? null,
      sourceField: 'averageCostKgs',
      value: STALE_PURCHASE_ONLY_HINT,
      calculation: 'Weighted-average / stale inventory valuation snapshot',
      whySelected: 'InventoryBalance.averageCostKgs used as catalog fallback',
      whyInvalid: 'Catalog must use oldest active HQ FIFO layer unit cost, not averageCost',
    };
  } else if (
    correctDisplayedCost != null &&
    Math.abs(currentDisplayedCost - correctDisplayedCost) > 0.009
  ) {
    incorrectSource = {
      sourceTable: 'Product',
      sourceRecordId: product.id,
      sourceField: n(product.finalCostKgs) > 0 ? 'finalCostKgs' : 'costPriceKgs',
      value: currentDisplayedCost,
      calculation: 'Stale Product catalog cost snapshot',
      whySelected: 'Stored product cost differs from active HQ FIFO layer',
      whyInvalid: 'Must equal selected active HQ FIFO unit cost',
    };
  }

  const plannedChanges: string[] = [];
  if (correctDisplayedCost != null) {
    if (Math.abs(n(product.finalCostKgs) - correctDisplayedCost) > 0.009) {
      plannedChanges.push(
        `Product.finalCostKgs ${n(product.finalCostKgs)} → ${correctDisplayedCost}`,
      );
    }
    if (Math.abs(n(product.costPriceKgs) - correctDisplayedCost) > 0.009) {
      plannedChanges.push(
        `Product.costPriceKgs ${n(product.costPriceKgs)} → ${correctDisplayedCost}`,
      );
    }
    for (const layer of activeLayers) {
      if (Math.abs(layer.storedBatchUnitCostKgs - layer.catalogResolvedUnitCostKgs) > 0.009) {
        plannedChanges.push(
          `FifoInventoryBatch ${layer.fifoLayerId} unitCostKgs ${layer.storedBatchUnitCostKgs} → ${layer.catalogResolvedUnitCostKgs}`,
        );
      }
    }
  }

  return {
    productId: product.id,
    SKU: product.sku,
    productName: product.name,
    warehouseId: hqWarehouse?.id ?? null,
    inventoryBalanceId: balance?.id ?? null,
    inventoryQuantity: balance ? n(balance.quantity) : 0,
    storedCatalogCost,
    storedInventoryBalanceCost,
    storedPurchaseCostKgs: n(product.purchaseCostKgs),
    firstShipmentFifoLayerId: firstShipment?.fifoLayerId ?? null,
    firstShipmentRemainingQuantity: firstShipment?.remainingQuantity ?? null,
    firstShipmentUnitCost: firstShipment?.catalogResolvedUnitCostKgs ?? null,
    secondShipmentFifoLayerId: secondShipment?.fifoLayerId ?? null,
    secondShipmentRemainingQuantity: secondShipment?.remainingQuantity ?? null,
    secondShipmentUnitCost: secondShipment?.catalogResolvedUnitCostKgs ?? null,
    selectedCorrectLayerId: resolved.batchId,
    currentDisplayedCost,
    correctDisplayedCost,
    difference:
      correctDisplayedCost != null
        ? roundDisplayMoney(currentDisplayedCost - correctDisplayedCost)
        : null,
    reason:
      correctDisplayedCost == null
        ? 'No active HQ FIFO layer with remainingQuantity > 0'
        : Math.abs(currentDisplayedCost - correctDisplayedCost) > 0.009
          ? 'Stale catalog snapshot / non-FIFO cost selected'
          : 'Already aligned with active HQ FIFO layer',
    incorrectSource,
    correctActiveFifoSource: resolved.available
      ? {
          fifoLayerId: resolved.batchId,
          unitCostKgs: resolved.costPriceKgs,
          warehouseId: resolved.warehouseId,
          procurementOrderItemId: resolved.procurementOrderItemId,
        }
      : null,
    consumedLayersCount: consumedLayers.length,
    activeLayersCount: activeLayers.length,
    layers: layerReports,
    plannedChanges,
  };
}

async function applyRepair(
  prisma: PrismaClient,
  report: Awaited<ReturnType<typeof diagnoseProduct>>,
  repairedBy: string,
) {
  if (report.correctDisplayedCost == null || report.plannedChanges.length === 0) {
    return { updated: false };
  }

  const correct = report.correctDisplayedCost;
  const productBefore = await prisma.product.findUnique({
    where: { id: report.productId },
    select: { finalCostKgs: true, costPriceKgs: true },
  });

  await prisma.product.update({
    where: { id: report.productId },
    data: {
      finalCostKgs: correct,
      costPriceKgs: correct,
    },
  });

  for (const layer of report.layers) {
    if (!layer.isActiveRemaining) continue;
    if (Math.abs(layer.storedBatchUnitCostKgs - layer.catalogResolvedUnitCostKgs) <= 0.009) {
      continue;
    }
    await prisma.fifoInventoryBatch.update({
      where: { id: layer.fifoLayerId },
      data: { unitCostKgs: layer.catalogResolvedUnitCostKgs },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: repairedBy,
      role: 'SYSTEM_ADMINISTRATOR',
      action: 'STALE_HQ_PRODUCT_COST_REPAIRED',
      entity: 'Product',
      entityId: report.productId,
      metadata: {
        productId: report.productId,
        warehouseId: report.warehouseId,
        oldCost: n(productBefore?.finalCostKgs),
        correctCost: correct,
        selectedFifoLayerId: report.selectedCorrectLayerId,
        sourceShipmentId: report.correctActiveFifoSource?.procurementOrderItemId ?? null,
        reason: report.reason,
        repairedBy,
        repairedAt: new Date().toISOString(),
        also: ['HQ_PRODUCT_FIFO_COST_RECONCILED'],
      } as Prisma.InputJsonValue,
    },
  });

  return { updated: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  if (!args.all && !args.productName && !args.sku) {
    console.error(
      'Provide --product-name=... or --sku=... or --all',
    );
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(args.sku
        ? { sku: { equals: args.sku, mode: 'insensitive' as const } }
        : {}),
      ...(args.productName
        ? {
            OR: [
              { name: { equals: args.productName } },
              { name: { contains: args.productName, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      finalCostKgs: true,
      costPriceKgs: true,
      purchaseCostKgs: true,
    },
    take: args.all ? 10000 : 50,
    orderBy: { name: 'asc' },
  });

  if (products.length === 0) {
    console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', found: 0, reports: [] }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const systemUser =
    (await prisma.user.findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })) ?? null;

  const reports = [];
  let repaired = 0;

  for (const product of products) {
    const report = await diagnoseProduct(prisma, product);
    if (args.apply && report.plannedChanges.length > 0 && systemUser) {
      const result = await applyRepair(prisma, report, systemUser.id);
      if (result.updated) repaired += 1;
    }
    reports.push(report);
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        found: products.length,
        repaired,
        reports,
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
