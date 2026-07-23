/**
 * Authoritative HQ inventory layer unit cost:
 * layer total landed cost ÷ layer quantity.
 * Prefer movement.totalCostKgs / qty when the movement carries a positive total.
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
    return Math.round((total / qty + Number.EPSILON) * 100) / 100;
  }
  return Math.round((Number(input.unitCostKgs ?? 0) + Number.EPSILON) * 100) / 100;
}
