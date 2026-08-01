import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isSeedStockMovementReference,
  SEED_FIFO_REFERENCE_TYPE,
} from '../pricing/pricing-fifo-business-layer.util';
import { resolveFifoLayerCatalogUnitCost } from './product-catalog-current-cost.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { activeBranchWarehouseWhere } from '../warehouse/warehouse.util';

type DbClient = PrismaService | Prisma.TransactionClient;

export type BranchProductCatalogCostResult = {
  currentBranchInventoryCost: number | null;
  branchInventoryCostAvailable: boolean;
  branchFifoLayerId: string | null;
  branchWarehouseId: string | null;
};

const EMPTY_COST: BranchProductCatalogCostResult = {
  currentBranchInventoryCost: null,
  branchInventoryCostAvailable: false,
  branchFifoLayerId: null,
  branchWarehouseId: null,
};

export async function resolveBranchWarehouseIdForCatalog(
  client: DbClient,
  branchId: string,
): Promise<string | null> {
  const warehouse = await client.warehouse.findFirst({
    where: { ...activeBranchWarehouseWhere, branchId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return warehouse?.id ?? null;
}

/**
 * Authoritative Branch CEO catalog unit cost — oldest active remaining Branch FIFO layer.
 * Includes exact HQ transfer cost plus allocated branch transport when present on the layer.
 */
export async function resolveCurrentBranchProductCatalogUnitCost(
  client: DbClient,
  input: { productId: string; warehouseId: string },
): Promise<BranchProductCatalogCostResult> {
  const costs = await resolveBranchProductCatalogCostsForProducts(client, {
    productIds: [input.productId],
    warehouseId: input.warehouseId,
  });
  return costs.get(input.productId) ?? { ...EMPTY_COST, branchWarehouseId: input.warehouseId };
}

export async function resolveBranchProductCatalogCostsForProducts(
  client: DbClient,
  input: { productIds: string[]; warehouseId: string },
): Promise<Map<string, BranchProductCatalogCostResult>> {
  const result = new Map<string, BranchProductCatalogCostResult>();
  const productIds = [...new Set(input.productIds.filter(Boolean))];
  if (!productIds.length) return result;

  const batches = await client.fifoInventoryBatch.findMany({
    where: {
      warehouseId: input.warehouseId,
      productId: { in: productIds },
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      referenceType: true,
      referenceId: true,
      unitCostKgs: true,
      stockMovementId: true,
    },
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

  for (const productId of productIds) {
    result.set(productId, { ...EMPTY_COST, branchWarehouseId: input.warehouseId });
  }

  for (const batch of batches) {
    const existing = result.get(batch.productId);
    if (!existing || existing.branchInventoryCostAvailable) continue;

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

    result.set(batch.productId, {
      currentBranchInventoryCost: roundDisplayMoney(unitCostKgs),
      branchInventoryCostAvailable: true,
      branchFifoLayerId: batch.id,
      branchWarehouseId: input.warehouseId,
    });
  }

  return result;
}
