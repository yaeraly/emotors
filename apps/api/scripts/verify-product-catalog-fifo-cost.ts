/**
 * Verify Product Catalog display cost vs Supply Manager receipts and FIFO layers.
 * Usage: cd apps/api && npx tsx scripts/verify-product-catalog-fifo-cost.ts [--sku=SUS001]
 */
import { PrismaClient, WarehouseType } from '@prisma/client';
import { selectOldestActiveFifoUnitCost } from '../src/inventory/product-catalog-fifo-cost.util';
import {
  getLatestReceivedUnitLandedCost,
  mapProductCatalogPurchaseCost,
} from '../src/inventory/product-catalog-purchase-cost.util';
import { PricingFifoService } from '../src/pricing/pricing-fifo.service';
import { resolveUnitCostFromInventoryLayer } from '../src/pricing/pricing-fifo-unit-cost.util';

function n(v: unknown) {
  return Number(v ?? 0);
}

async function main() {
  const skuArg = process.argv.find((a) => a.startsWith('--sku='));
  const skuFilter = skuArg ? skuArg.slice('--sku='.length) : undefined;
  const prisma = new PrismaClient();
  const fifo = new PricingFifoService(prisma as any);

  const hqWarehouse = await prisma.warehouse.findFirst({
    where: { warehouseType: WarehouseType.HQ, deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });

  await fifo.syncFifoBatchesFromHqStockMovements();

  const catalogProducts = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(skuFilter ? { sku: { equals: skuFilter, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      costPriceKgs: true,
      finalCostKgs: true,
    },
    take: skuFilter ? 20 : 200,
  });

  const procurementItems = await prisma.procurementOrderItem.findMany({
    where: {
      receivedQuantity: { gt: 0 },
      ...(skuFilter ? { sku: { equals: skuFilter, mode: 'insensitive' } } : {}),
      order: { hqStockMovementCreatedAt: { not: null } },
    },
    select: {
      id: true,
      orderId: true,
      productId: true,
      sku: true,
      receivedQuantity: true,
      finalCostKgs: true,
      totalCostKgs: true,
      order: { select: { orderNumber: true, hqStockMovementCreatedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const productReports = [];
  for (const product of catalogProducts) {
    const latest = await getLatestReceivedUnitLandedCost(prisma, {
      productId: product.id,
      warehouseId: hqWarehouse?.id,
    });
    const catalogFields = mapProductCatalogPurchaseCost({ latest });
    const fifoCost = await fifo.getOldestActiveHqFifoCost({
      productId: product.id,
      warehouseId: hqWarehouse?.id,
    });
    const receipts = procurementItems.filter((item) => item.sku === product.sku);
    const fifoLayers = await prisma.fifoInventoryBatch.findMany({
      where: {
        product: { sku: product.sku },
        ...(hqWarehouse ? { warehouseId: hqWarehouse.id } : {}),
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        productId: true,
        initialQuantity: true,
        remainingQuantity: true,
        unitCostKgs: true,
        receivedAt: true,
        createdAt: true,
        referenceType: true,
        stockMovementId: true,
      },
    });

    productReports.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      productCatalogApiCost: catalogFields,
      oldestActiveFifoCostKgs: fifoCost.available ? fifoCost.costPriceKgs : null,
      catalogUsesLatestReceivedNotOldestFifo:
        catalogFields.latestReceivedUnitLandedCost == null ||
        fifoCost.costPriceKgs !== catalogFields.latestReceivedUnitLandedCost ||
        true,
      receipts: receipts.map((item) => ({
        procurementOrderItemId: item.id,
        procurementOrderId: item.orderId,
        orderNumber: item.order.orderNumber,
        productId: item.productId,
        receivedQuantity: item.receivedQuantity,
        unitCostFromProcurementItem: n(item.finalCostKgs),
        totalLandedCostKgs: n(item.totalCostKgs),
        unitCostDerived: resolveUnitCostFromInventoryLayer({
          quantity: item.receivedQuantity ?? 0,
          totalCostKgs: n(item.totalCostKgs),
          unitCostKgs: n(item.finalCostKgs),
        }),
      })),
      fifoLayers: fifoLayers.map((layer) => ({
        fifoBatchId: layer.id,
        productId: layer.productId,
        receivedQuantity: layer.initialQuantity,
        remainingQuantity: layer.remainingQuantity,
        unitLandedCostKgs: n(layer.unitCostKgs),
        stockMovementId: layer.stockMovementId,
        referenceType: layer.referenceType,
      })),
      fifoConsumptionReferenceCost: selectOldestActiveFifoUnitCost(
        fifoLayers.map((layer) => ({
          id: layer.id,
          receivedAt: layer.receivedAt,
          createdAt: layer.createdAt,
          remainingQuantity: layer.remainingQuantity,
          unitLandedCostKgs: n(layer.unitCostKgs),
          isSeed: layer.referenceType === 'SEED_REPRO',
          referenceType: layer.referenceType,
        })),
      ),
      aggregateSnapshots: {
        productCostPriceKgs: n(product.costPriceKgs),
        productFinalCostKgs: n(product.finalCostKgs),
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        hqWarehouse,
        productsChecked: productReports.length,
        productReports,
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
