import { Prisma, WarehouseType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isBusinessProcurementReceiptReference,
  isSeedStockMovementReference,
  SEED_FIFO_REFERENCE_TYPE,
} from '../pricing/pricing-fifo-business-layer.util';
import {
  resolveAuthoritativeFifoLayerUnitCost,
  resolveUnitCostFromInventoryLayer,
} from '../pricing/pricing-fifo-unit-cost.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

type DbClient = PrismaService | Prisma.TransactionClient;

export type CurrentProductCatalogCostResult = {
  costPriceKgs: number;
  available: boolean;
  source: 'HQ_FIFO_ACTIVE_LAYER' | 'NO_FIFO_LAYER';
  batchId: string | null;
  receivedAt: Date | null;
  warehouseId: string | null;
  procurementOrderItemId: string | null;
};

type FifoBatchRow = {
  id: string;
  productId: string;
  warehouseId: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitCostKgs: Prisma.Decimal | number;
  receivedAt: Date;
  createdAt: Date;
  referenceType: string | null;
  referenceId: string | null;
  stockMovementId: string | null;
};

type MovementRow = {
  id: string;
  quantity: number;
  unitCostKgs: Prisma.Decimal | number;
  totalCostKgs: Prisma.Decimal | number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
};

function n(value: unknown) {
  return Number(value ?? 0);
}

/**
 * Authoritative per-unit landed cost for a procurement receipt layer.
 * Supply Manager «Себестоимость» uses finalized ProcurementLandedCostSnapshot —
 * not stale StockMovement purchase-only snapshots.
 */
export function resolveProcurementLayerUnitCostFromSources(input: {
  snapshotUnitLandedCostKgs?: number | null;
  orderLineTotalCostKgs?: number | null;
  orderLineQuantity?: number | null;
  orderLineFinalUnitCostKgs?: number | null;
  receivedQuantity: number;
  movementTotalCostKgs?: number | null;
  movementQuantity?: number | null;
  movementUnitCostKgs?: number | null;
  batchUnitCostKgs: number;
}) {
  const snapshotUnit = n(input.snapshotUnitLandedCostKgs);
  if (snapshotUnit > 0) {
    return roundDisplayMoney(snapshotUnit);
  }

  const orderQty = Math.abs(n(input.orderLineQuantity));
  const orderTotal = n(input.orderLineTotalCostKgs);
  if (orderTotal > 0 && orderQty > 0) {
    return resolveUnitCostFromInventoryLayer({
      quantity: orderQty,
      totalCostKgs: orderTotal,
      unitCostKgs: input.orderLineFinalUnitCostKgs,
    });
  }

  return resolveAuthoritativeFifoLayerUnitCost({
    initialQuantity: input.receivedQuantity,
    batchUnitCostKgs: input.batchUnitCostKgs,
    movementQuantity: input.movementQuantity,
    movementUnitCostKgs: input.movementUnitCostKgs,
    movementTotalCostKgs: input.movementTotalCostKgs,
  });
}

export async function resolveProcurementReceiptLayerUnitCost(
  client: DbClient,
  input: {
    receivingId: string;
    productId: string;
    initialQuantity: number;
    movementQuantity?: number | null;
    movementUnitCostKgs?: number | null;
    movementTotalCostKgs?: number | null;
    batchUnitCostKgs: number;
  },
) {
  const receivingItem = await client.procurementGoodsReceivingItem.findFirst({
    where: { receivingId: input.receivingId, productId: input.productId },
    select: { procurementItemId: true, receivedQuantity: true },
  });

  if (!receivingItem?.procurementItemId) {
    return resolveAuthoritativeFifoLayerUnitCost({
      initialQuantity: input.initialQuantity,
      batchUnitCostKgs: input.batchUnitCostKgs,
      movementQuantity: input.movementQuantity,
      movementUnitCostKgs: input.movementUnitCostKgs,
      movementTotalCostKgs: input.movementTotalCostKgs,
    });
  }

  const [snapshot, orderItem] = await Promise.all([
    client.procurementLandedCostSnapshot.findUnique({
      where: { procurementOrderItemId: receivingItem.procurementItemId },
      select: { unitLandedCostKgs: true, totalLandedCostKgs: true },
    }),
    client.procurementOrderItem.findUnique({
      where: { id: receivingItem.procurementItemId },
      select: { totalCostKgs: true, finalCostKgs: true, quantity: true },
    }),
  ]);

  return resolveProcurementLayerUnitCostFromSources({
    snapshotUnitLandedCostKgs: snapshot ? n(snapshot.unitLandedCostKgs) : null,
    orderLineTotalCostKgs: orderItem ? n(orderItem.totalCostKgs) : null,
    orderLineQuantity: orderItem?.quantity,
    orderLineFinalUnitCostKgs: orderItem ? n(orderItem.finalCostKgs) : null,
    receivedQuantity: receivingItem.receivedQuantity ?? input.initialQuantity,
    movementTotalCostKgs: input.movementTotalCostKgs,
    movementQuantity: input.movementQuantity,
    movementUnitCostKgs: input.movementUnitCostKgs,
    batchUnitCostKgs: input.batchUnitCostKgs,
  });
}

export async function resolveFifoLayerCatalogUnitCost(
  client: DbClient,
  batch: Pick<FifoBatchRow, 'referenceType' | 'referenceId' | 'productId' | 'initialQuantity' | 'unitCostKgs'>,
  movement: MovementRow | null,
) {
  if (isBusinessProcurementReceiptReference(batch.referenceType) && batch.referenceId) {
    return resolveProcurementReceiptLayerUnitCost(client, {
      receivingId: batch.referenceId,
      productId: batch.productId,
      initialQuantity: batch.initialQuantity,
      movementQuantity: movement?.quantity,
      movementUnitCostKgs: movement ? n(movement.unitCostKgs) : null,
      movementTotalCostKgs: movement ? n(movement.totalCostKgs) : null,
      batchUnitCostKgs: n(batch.unitCostKgs),
    });
  }

  return resolveAuthoritativeFifoLayerUnitCost({
    initialQuantity: batch.initialQuantity,
    batchUnitCostKgs: n(batch.unitCostKgs),
    movementQuantity: movement?.quantity,
    movementUnitCostKgs: movement ? n(movement.unitCostKgs) : null,
    movementTotalCostKgs: movement ? n(movement.totalCostKgs) : null,
  });
}

async function resolveHqFifoProductIds(client: DbClient, productId: string) {
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
 * Single authoritative backend source for Справочник товаров current unit cost.
 * Oldest HQ FIFO layer with remainingQuantity > 0; unit cost from finalized
 * procurement landed-cost snapshot when applicable.
 */
export async function resolveCurrentProductCatalogUnitCost(
  client: DbClient,
  input: { productId: string; warehouseId?: string; branchId?: string },
): Promise<CurrentProductCatalogCostResult> {
  const productIds = await resolveHqFifoProductIds(client, input.productId);

  const batches = await client.fifoInventoryBatch.findMany({
    where: {
      productId: { in: productIds },
      remainingQuantity: { gt: 0 },
      ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
      warehouse: {
        warehouseType: WarehouseType.HQ,
        deletedAt: null,
        isActive: true,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
    },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  const movementIds = batches
    .map((batch) => batch.stockMovementId)
    .filter((id): id is string => Boolean(id));
  const movements =
    movementIds.length > 0
      ? await client.stockMovement.findMany({
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

  let procurementOrderItemId: string | null = null;

  for (const batch of batches) {
    if (batch.referenceType === SEED_FIFO_REFERENCE_TYPE) continue;

    const movement = batch.stockMovementId ? movementById.get(batch.stockMovementId) : null;
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
      continue;
    }

    const unitCostKgs = await resolveFifoLayerCatalogUnitCost(client, batch, movement ?? null);
    if (unitCostKgs <= 0) continue;

    if (isBusinessProcurementReceiptReference(batch.referenceType) && batch.referenceId) {
      const receivingItem = await client.procurementGoodsReceivingItem.findFirst({
        where: { receivingId: batch.referenceId, productId: batch.productId },
        select: { procurementItemId: true },
      });
      procurementOrderItemId = receivingItem?.procurementItemId ?? null;
    }

    return {
      costPriceKgs: unitCostKgs,
      available: true,
      source: 'HQ_FIFO_ACTIVE_LAYER',
      batchId: batch.id,
      receivedAt: batch.receivedAt,
      warehouseId: batch.warehouseId,
      procurementOrderItemId,
    };
  }

  return {
    costPriceKgs: 0,
    available: false,
    source: 'NO_FIFO_LAYER',
    batchId: null,
    receivedAt: null,
    warehouseId: input.warehouseId ?? null,
    procurementOrderItemId: null,
  };
}

export type ProductCatalogCostMismatch = {
  productId: string;
  productName: string;
  sku: string;
  currentDirectoryCost: number | null;
  expectedFifoCost: number | null;
  fifoBatchId: string | null;
  procurementOrderItemId: string | null;
  availableQuantity: number;
  storedProductFinalCostKgs: number;
  storedProductCostPriceKgs: number;
  storedBatchUnitCostKgs: number | null;
  movementUnitCostKgs: number | null;
  snapshotUnitLandedCostKgs: number | null;
};

export async function findProductCatalogCostMismatches(
  client: DbClient,
  options: { sku?: string; limit?: number } = {},
): Promise<ProductCatalogCostMismatch[]> {
  const products = await client.product.findMany({
    where: {
      deletedAt: null,
      ...(options.sku ? { sku: { equals: options.sku, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      finalCostKgs: true,
      costPriceKgs: true,
    },
    take: options.limit ?? 10000,
  });

  const mismatches: ProductCatalogCostMismatch[] = [];

  for (const product of products) {
    const resolved = await resolveCurrentProductCatalogUnitCost(client, { productId: product.id });
    const expected = resolved.available ? resolved.costPriceKgs : null;

    const oldestBatch = resolved.batchId
      ? await client.fifoInventoryBatch.findUnique({
          where: { id: resolved.batchId },
          select: {
            id: true,
            remainingQuantity: true,
            unitCostKgs: true,
            stockMovementId: true,
            referenceType: true,
            referenceId: true,
            productId: true,
          },
        })
      : null;

    let movementUnitCostKgs: number | null = null;
    let snapshotUnitLandedCostKgs: number | null = null;

    if (oldestBatch?.stockMovementId) {
      const movement = await client.stockMovement.findUnique({
        where: { id: oldestBatch.stockMovementId },
        select: { unitCostKgs: true },
      });
      movementUnitCostKgs = movement ? n(movement.unitCostKgs) : null;
    }

    if (resolved.procurementOrderItemId) {
      const snapshot = await client.procurementLandedCostSnapshot.findUnique({
        where: { procurementOrderItemId: resolved.procurementOrderItemId },
        select: { unitLandedCostKgs: true },
      });
      snapshotUnitLandedCostKgs = snapshot ? n(snapshot.unitLandedCostKgs) : null;
    }

    const storedDirectoryCost = n(product.finalCostKgs) > 0 ? n(product.finalCostKgs) : n(product.costPriceKgs);
    const batchStored = oldestBatch ? n(oldestBatch.unitCostKgs) : null;

    const directoryMismatch =
      expected != null &&
      (Math.abs(storedDirectoryCost - expected) > 0.01 ||
        (batchStored != null && Math.abs(batchStored - expected) > 0.01) ||
        (movementUnitCostKgs != null && Math.abs(movementUnitCostKgs - expected) > 0.01));

    if (!directoryMismatch && expected == null) continue;

    if (directoryMismatch || (expected != null && storedDirectoryCost !== expected)) {
      mismatches.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentDirectoryCost: storedDirectoryCost > 0 ? storedDirectoryCost : null,
        expectedFifoCost: expected,
        fifoBatchId: resolved.batchId,
        procurementOrderItemId: resolved.procurementOrderItemId,
        availableQuantity: oldestBatch?.remainingQuantity ?? 0,
        storedProductFinalCostKgs: n(product.finalCostKgs),
        storedProductCostPriceKgs: n(product.costPriceKgs),
        storedBatchUnitCostKgs: batchStored,
        movementUnitCostKgs,
        snapshotUnitLandedCostKgs,
      });
    }
  }

  return mismatches;
}
