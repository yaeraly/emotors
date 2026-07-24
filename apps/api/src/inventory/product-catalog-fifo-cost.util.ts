import type { OldestActiveHqFifoCostResult } from '../pricing/pricing-fifo.service';

export type ProductCatalogFifoCostFields = {
  /** Oldest active HQ FIFO batch unit landed cost (remainingQuantity > 0). */
  currentFifoUnitCost: number | null;
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
 */
export function mapProductCatalogFifoCost(input: {
  fifo: OldestActiveHqFifoCostResult;
}): ProductCatalogFifoCostFields {
  const costAvailable = Boolean(input.fifo.available && input.fifo.costPriceKgs > 0);
  const currentFifoUnitCost = costAvailable ? input.fifo.costPriceKgs : null;
  return {
    currentFifoUnitCost,
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
