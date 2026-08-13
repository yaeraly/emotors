import {
  Prisma,
  PrismaClient,
  ProcurementOrderStatus,
} from '@prisma/client';
import { isBusinessProcurementReceiptReference } from '../pricing/pricing-fifo-business-layer.util';
import { resolveUnitCostFromInventoryLayer } from '../pricing/pricing-fifo-unit-cost.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type LatestReceivedUnitLandedCostResult = {
  latestReceivedUnitLandedCost: number;
  available: boolean;
  source: 'LATEST_PROCUREMENT_RECEIPT' | 'NO_RECEIPT';
  batchId: string | null;
  receivedAt: Date | null;
  warehouseId: string | null;
  procurementGoodsReceivingId: string | null;
};

export type ProductCatalogPurchaseCostFields = {
  latestReceivedUnitLandedCost: number | null;
  finalCostKgs: number | null;
  costAvailable: boolean;
  costSource: string;
  costBatchId: string | null;
  costReceivedAt: Date | null;
  costWarehouseId: string | null;
};

function n(value: unknown) {
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function resolveProductIdsBySku(client: DbClient, productId: string) {
  const ids = new Set<string>([productId]);
  const product = await client.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { sku: true },
  });
  const sku = product?.sku?.trim();
  if (!sku) return [...ids];
  const siblings = await client.product.findMany({
    where: { sku, deletedAt: null },
    select: { id: true },
  });
  for (const row of siblings) ids.add(row.id);
  return [...ids];
}

/**
 * Latest successfully received Supply Manager purchase unit landed cost.
 * Used only for Product Catalog display — does not affect FIFO consumption order.
 */
export async function getLatestReceivedUnitLandedCost(
  client: DbClient,
  input: { productId: string; warehouseId?: string },
): Promise<LatestReceivedUnitLandedCostResult> {
  const productIds = await resolveProductIdsBySku(client, input.productId);

  const receivingItem = await client.procurementGoodsReceivingItem.findFirst({
    where: {
      productId: { in: productIds },
      receivedQuantity: { gt: 0 },
      receiving: {
        deletedAt: null,
        ...(input.warehouseId ? { hqWarehouseId: input.warehouseId } : {}),
        procurementOrder: {
          deletedAt: null,
          hqStockMovementCreatedAt: { not: null },
          status: ProcurementOrderStatus.RECEIVED_TO_HQ_WAREHOUSE,
        },
      },
    },
    orderBy: [{ receiving: { receivedAt: 'desc' } }, { createdAt: 'desc' }],
    select: {
      id: true,
      productId: true,
      procurementItemId: true,
      receivedQuantity: true,
      receiving: {
        select: {
          id: true,
          receivedAt: true,
          hqWarehouseId: true,
        },
      },
    },
  });

  if (!receivingItem?.procurementItemId) {
    return {
      latestReceivedUnitLandedCost: 0,
      available: false,
      source: 'NO_RECEIPT',
      batchId: null,
      receivedAt: null,
      warehouseId: input.warehouseId ?? null,
      procurementGoodsReceivingId: null,
    };
  }

  const [snapshot, procurementItem, fifoBatch] = await Promise.all([
    client.procurementLandedCostSnapshot.findUnique({
      where: { procurementOrderItemId: receivingItem.procurementItemId },
      select: { unitLandedCostKgs: true, totalLandedCostKgs: true },
    }),
    client.procurementOrderItem.findUnique({
      where: { id: receivingItem.procurementItemId },
      select: { finalCostKgs: true, totalCostKgs: true, receivedQuantity: true },
    }),
    client.fifoInventoryBatch.findFirst({
      where: {
        productId: { in: productIds },
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
        referenceId: receivingItem.receiving.id,
        ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      },
      select: { id: true, unitCostKgs: true, stockMovementId: true },
    }),
  ]);

  const unitFromSnapshot =
    snapshot && n(snapshot.unitLandedCostKgs) > 0
      ? roundMoney(n(snapshot.unitLandedCostKgs))
      : 0;
  const unitFromProcurement = resolveUnitCostFromInventoryLayer({
    quantity: receivingItem.receivedQuantity,
    totalCostKgs: n(snapshot?.totalLandedCostKgs) > 0 ? n(snapshot?.totalLandedCostKgs) : n(procurementItem?.totalCostKgs),
    unitCostKgs: n(procurementItem?.finalCostKgs),
  });
  const unitLandedCostKgs = unitFromSnapshot > 0 ? unitFromSnapshot : unitFromProcurement;

  return {
    latestReceivedUnitLandedCost: unitLandedCostKgs,
    available: unitLandedCostKgs > 0,
    source: 'LATEST_PROCUREMENT_RECEIPT',
    batchId: fifoBatch?.id ?? null,
    receivedAt: receivingItem.receiving.receivedAt,
    warehouseId: receivingItem.receiving.hqWarehouseId,
    procurementGoodsReceivingId: receivingItem.receiving.id,
  };
}

export function mapProductCatalogPurchaseCost(input: {
  latest: LatestReceivedUnitLandedCostResult;
}): ProductCatalogPurchaseCostFields {
  const costAvailable = Boolean(input.latest.available && input.latest.latestReceivedUnitLandedCost > 0);
  const latestReceivedUnitLandedCost = costAvailable
    ? input.latest.latestReceivedUnitLandedCost
    : null;
  return {
    latestReceivedUnitLandedCost,
    finalCostKgs: latestReceivedUnitLandedCost,
    costAvailable,
    costSource: input.latest.source,
    costBatchId: input.latest.batchId,
    costReceivedAt: input.latest.receivedAt,
    costWarehouseId: input.latest.warehouseId,
  };
}

/**
 * In-memory helper for tests: latest procurement receipt layer by receivedAt desc.
 */
export function selectLatestReceivedUnitCost<
  T extends {
    unitLandedCostKgs: number;
    receivedAt: string | Date;
    createdAt: string | Date;
    id: string;
    isSeed?: boolean;
    referenceType?: string | null;
  },
>(layers: T[]) {
  const business = layers
    .filter(
      (layer) =>
        !layer.isSeed &&
        layer.unitLandedCostKgs > 0 &&
        isBusinessProcurementReceiptReference(layer.referenceType),
    )
    .sort((a, b) => {
      const aReceived = new Date(a.receivedAt).getTime();
      const bReceived = new Date(b.receivedAt).getTime();
      if (aReceived !== bReceived) return bReceived - aReceived;
      const aCreated = new Date(a.createdAt).getTime();
      const bCreated = new Date(b.createdAt).getTime();
      if (aCreated !== bCreated) return bCreated - aCreated;
      return b.id.localeCompare(a.id);
    });
  return business[0]?.unitLandedCostKgs ?? null;
}

export async function resolveLatestReceivedUnitLandedCostForHqProduct(
  client: DbClient,
  productId: string,
  warehouseId?: string | null,
) {
  return getLatestReceivedUnitLandedCost(client, {
    productId,
    ...(warehouseId ? { warehouseId } : {}),
  });
}
