import type { OldestActiveHqFifoCostResult } from '../pricing/pricing-fifo.service';
import { resolveAuthoritativeFifoLayerUnitCost } from '../pricing/pricing-fifo-unit-cost.util';

export type ProductCatalogFifoCostFields = {
  /** Oldest active HQ FIFO batch unit landed cost (remainingQuantity > 0). */
  currentFifoUnitCost: number | null;
  /** Explicit alias used by HQ Product Catalog (Справочник товаров). */
  currentHqFifoUnitCost: number | null;
  finalCostKgs: number | null;
  costAvailable: boolean;
  costSource: string;
  costBatchId: string | null;
  costReceivedAt: Date | null;
  costWarehouseId: string | null;
};

/**
 * Map shared HQ FIFO resolver output to Product Catalog API fields.
 * Never use Product.costPriceKgs, Product.finalCostKgs, or InventoryBalance.averageCostKgs.
 *
 * Semantic: Себестоимость = unit cost of the next active HQ FIFO layer that will be issued.
 */
export function mapProductCatalogFifoCost(input: {
  fifo: OldestActiveHqFifoCostResult;
}): ProductCatalogFifoCostFields {
  const costAvailable = Boolean(input.fifo.available && input.fifo.costPriceKgs > 0);
  const currentFifoUnitCost = costAvailable ? input.fifo.costPriceKgs : null;
  return {
    currentFifoUnitCost,
    currentHqFifoUnitCost: currentFifoUnitCost,
    finalCostKgs: currentFifoUnitCost,
    costAvailable,
    costSource: input.fifo.source,
    costBatchId: input.fifo.batchId,
    costReceivedAt: input.fifo.receivedAt,
    costWarehouseId: input.fifo.warehouseId ?? null,
  };
}

/**
 * Oldest active business FIFO layer from in-memory layers (tests).
 */
export function selectOldestActiveFifoUnitCost<
  T extends {
    remainingQuantity: number;
    unitLandedCostKgs: number;
    receivedAt: string | Date;
    createdAt: string | Date;
    id: string;
    isSeed?: boolean;
    referenceType?: string | null;
  },
>(layers: T[]) {
  const active = layers
    .filter((layer) => !layer.isSeed && layer.remainingQuantity > 0 && layer.unitLandedCostKgs > 0)
    .sort((a, b) => {
      const aReceived = new Date(a.receivedAt).getTime();
      const bReceived = new Date(b.receivedAt).getTime();
      if (aReceived !== bReceived) return aReceived - bReceived;
      const aCreated = new Date(a.createdAt).getTime();
      const bCreated = new Date(b.createdAt).getTime();
      if (aCreated !== bCreated) return aCreated - bCreated;
      return a.id.localeCompare(b.id);
    });
  return active[0]?.unitLandedCostKgs ?? null;
}

export type FifoCatalogLayerInput = {
  id: string;
  receivedAt: string | Date;
  createdAt: string | Date;
  remainingQuantity: number;
  initialQuantity: number;
  batchUnitCostKgs: number;
  movementTotalCostKgs?: number | null;
  movementQuantity?: number | null;
  movementUnitCostKgs?: number | null;
  isSeed?: boolean;
  referenceType?: string | null;
};

function compareFifoCatalogLayers(a: FifoCatalogLayerInput, b: FifoCatalogLayerInput) {
  const aReceived = new Date(a.receivedAt).getTime();
  const bReceived = new Date(b.receivedAt).getTime();
  if (aReceived !== bReceived) return aReceived - bReceived;
  const aCreated = new Date(a.createdAt).getTime();
  const bCreated = new Date(b.createdAt).getTime();
  if (aCreated !== bCreated) return aCreated - bCreated;
  return a.id.localeCompare(b.id);
}

/**
 * Authoritative product-catalog unit cost from oldest active FIFO layer.
 * Prefers exact stored unit fields; derives from total÷qty only as last resort.
 */
export function resolveOldestActiveFifoCatalogUnitCost(layers: FifoCatalogLayerInput[]) {
  const active = layers
    .filter((layer) => !layer.isSeed && layer.remainingQuantity > 0)
    .sort(compareFifoCatalogLayers);
  const oldest = active[0];
  if (!oldest) {
    return { unitCostKgs: null, batchId: null };
  }

  // Prefer movement landed total ÷ qty over a possibly stale batch.unitCostKgs
  // (e.g. inventory average 407.53 / purchase-only 309.78).
  const unitCostKgs = resolveAuthoritativeFifoLayerUnitCost({
    initialQuantity: oldest.initialQuantity,
    batchUnitCostKgs: oldest.batchUnitCostKgs,
    movementQuantity: oldest.movementQuantity,
    movementUnitCostKgs: oldest.movementUnitCostKgs,
    movementTotalCostKgs: oldest.movementTotalCostKgs,
  });

  if (unitCostKgs <= 0) {
    return { unitCostKgs: null, batchId: null };
  }

  return { unitCostKgs, batchId: oldest.id };
}

/** Simulate FIFO consumption for catalog regression tests (oldest layer first). */
export function simulateFifoCatalogConsumption(layers: FifoCatalogLayerInput[], quantity: number) {
  const next = layers.map((layer) => ({ ...layer }));
  let remainingToConsume = quantity;
  const ordered = [...next].sort(compareFifoCatalogLayers);

  for (const layer of ordered) {
    if (remainingToConsume <= 0) break;
    if (layer.remainingQuantity <= 0) continue;
    const take = Math.min(layer.remainingQuantity, remainingToConsume);
    layer.remainingQuantity -= take;
    remainingToConsume -= take;
  }

  return next;
}
