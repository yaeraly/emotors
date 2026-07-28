import { deriveDisplayUnitCost, roundDisplayMoney } from './product-cost-precision.util';

/**
 * Authoritative HQ inventory layer unit cost for display/storage:
 * derived from layer total landed cost ÷ layer quantity (never round unit then multiply).
 */
export function resolveUnitCostFromInventoryLayer(input: {
  quantity: number;
  unitCostKgs?: number | null;
  totalCostKgs?: number | null;
}) {
  const qty = Math.abs(Number(input.quantity ?? 0));
  if (qty <= 0) return 0;
  const total = Number(input.totalCostKgs ?? 0);
  if (total > 0) {
    return deriveDisplayUnitCost(total, qty);
  }
  return roundDisplayMoney(Number(input.unitCostKgs ?? 0));
}

/**
 * Authoritative per-unit landed cost for a FIFO layer.
 * Prefers StockMovement.totalCostKgs ÷ received quantity (Prisma Decimal path).
 * Falls back to stored batch.unitCostKgs when movement totals are unavailable.
 */
export function resolveAuthoritativeFifoLayerUnitCost(input: {
  initialQuantity: number;
  batchUnitCostKgs: number;
  movementQuantity?: number | null;
  movementUnitCostKgs?: number | null;
  movementTotalCostKgs?: number | null;
}) {
  const receivedQty =
    input.initialQuantity > 0
      ? input.initialQuantity
      : Math.abs(Number(input.movementQuantity ?? 0));
  if (receivedQty <= 0) return 0;
  return resolveUnitCostFromInventoryLayer({
    quantity: receivedQty,
    unitCostKgs: input.movementUnitCostKgs ?? input.batchUnitCostKgs,
    totalCostKgs: input.movementTotalCostKgs,
  });
}
