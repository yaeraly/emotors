import { Prisma, WarehouseType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isBusinessProcurementReceiptReference,
  isSeedStockMovementReference,
  SEED_FIFO_REFERENCE_TYPE,
} from '../pricing/pricing-fifo-business-layer.util';
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
 * Product catalog unit cost — exact stored unit fields only.
 * Never recalculates rounded totalCostKgs ÷ quantity (avoids 0.06 drift).
 */
export function resolveStoredFifoCatalogUnitCostFromSources(input: {
  batchUnitCostKgs?: Prisma.Decimal | number | null;
  snapshotUnitLandedCostKgs?: Prisma.Decimal | number | null;
  orderLineFinalUnitCostKgs?: Prisma.Decimal | number | null;
  movementUnitCostKgs?: Prisma.Decimal | number | null;
}) {
  for (const raw of [
    input.snapshotUnitLandedCostKgs,
    input.orderLineFinalUnitCostKgs,
    input.batchUnitCostKgs,
    input.movementUnitCostKgs,
  ]) {
    const value = roundDisplayMoney(raw ?? 0);
    if (value > 0) return value;
  }
  return 0;
}

export async function resolveProcurementReceiptLayerUnitCost(
  client: DbClient,
  input: {
    receivingId: string;
    productId: string;
    batchUnitCostKgs: number;
    movementUnitCostKgs?: number | null;
  },
) {
  const receivingItem = await client.procurementGoodsReceivingItem.findFirst({
    where: { receivingId: input.receivingId, productId: input.productId },
    select: { procurementItemId: true },
  });

  if (!receivingItem?.procurementItemId) {
    return resolveStoredFifoCatalogUnitCostFromSources({
      batchUnitCostKgs: input.batchUnitCostKgs,
      movementUnitCostKgs: input.movementUnitCostKgs,
    });
  }

  const [snapshot, orderItem] = await Promise.all([
    client.procurementLandedCostSnapshot.findUnique({
      where: { procurementOrderItemId: receivingItem.procurementItemId },
      select: { unitLandedCostKgs: true },
    }),
    client.procurementOrderItem.findUnique({
      where: { id: receivingItem.procurementItemId },
      select: { finalCostKgs: true },
    }),
  ]);

  return resolveStoredFifoCatalogUnitCostFromSources({
    batchUnitCostKgs: input.batchUnitCostKgs,
    snapshotUnitLandedCostKgs: snapshot?.unitLandedCostKgs,
    orderLineFinalUnitCostKgs: orderItem?.finalCostKgs,
    movementUnitCostKgs: input.movementUnitCostKgs,
  });
}

export async function resolveFifoLayerCatalogUnitCost(
  client: DbClient,
  batch: Pick<FifoBatchRow, 'referenceType' | 'referenceId' | 'productId' | 'unitCostKgs'>,
  movement: MovementRow | null,
) {
  if (isBusinessProcurementReceiptReference(batch.referenceType) && batch.referenceId) {
    return resolveProcurementReceiptLayerUnitCost(client, {
      receivingId: batch.referenceId,
      productId: batch.productId,
      batchUnitCostKgs: n(batch.unitCostKgs),
      movementUnitCostKgs: movement ? n(movement.unitCostKgs) : null,
    });
  }

  return resolveStoredFifoCatalogUnitCostFromSources({
    batchUnitCostKgs: batch.unitCostKgs,
    movementUnitCostKgs: movement ? movement.unitCostKgs : null,
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
 * Authoritative backend source for Справочник товаров current unit cost.
 * Returns exact FifoInventoryBatch.unitCostKgs (or equivalent stored unit fields).
 * Never divides rounded line totals by quantity.
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
  difference: number | null;
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
    const difference =
      expected != null && storedDirectoryCost > 0
        ? roundDisplayMoney(storedDirectoryCost - expected)
        : expected != null
          ? null
          : null;

    const directoryMismatch =
      expected != null &&
      (Math.abs(storedDirectoryCost - expected) > 0.009 ||
        (batchStored != null && Math.abs(batchStored - expected) > 0.009) ||
        (movementUnitCostKgs != null && Math.abs(movementUnitCostKgs - expected) > 0.009) ||
        (snapshotUnitLandedCostKgs != null &&
          Math.abs(snapshotUnitLandedCostKgs - expected) > 0.009));

    if (!directoryMismatch && expected == null) continue;

    if (directoryMismatch || (expected != null && Math.abs(storedDirectoryCost - expected) > 0.009)) {
      mismatches.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentDirectoryCost: storedDirectoryCost > 0 ? storedDirectoryCost : null,
        expectedFifoCost: expected,
        difference:
          expected != null && storedDirectoryCost > 0
            ? roundDisplayMoney(storedDirectoryCost - expected)
            : null,
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
