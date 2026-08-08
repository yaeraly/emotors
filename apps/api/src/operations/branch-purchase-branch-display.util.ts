import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

/** CEO-approved branch unit price frozen on the order line (never wholesale/cost). */
export function resolveBranchPurchaseBranchUnitPriceKgs(item: {
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
}): number | null {
  const raw = item.branchPurchasePriceKgs ?? item.resolvedBranchPriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

/** Branch Sales display quantity: requested quantity shown in the table. */
export function resolveBranchPurchaseBranchDisplayQuantity(item: { quantity: number }): number {
  return Math.max(0, Number(item.quantity ?? 0));
}

/** Authoritative branch line total: displayed quantity × CEO branch unit price. */
export function resolveBranchPurchaseBranchLineTotalKgs(item: {
  quantity: number;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  totalAmount?: unknown;
}): number {
  const quantity = resolveBranchPurchaseBranchDisplayQuantity(item);
  const unitPrice = resolveBranchPurchaseBranchUnitPriceKgs(item);
  if (unitPrice != null && quantity > 0) {
    return roundDisplayMoney(unitPrice * quantity);
  }
  const stored = roundDisplayMoney(Number(item.totalAmount ?? 0));
  return stored > 0 ? stored : 0;
}

export function sumBranchPurchaseBranchLineTotalsKgs(
  items: Array<{
    quantity: number;
    branchPurchasePriceKgs?: unknown;
    resolvedBranchPriceKgs?: unknown;
    totalAmount?: unknown;
  }>,
): number {
  return roundDisplayMoney(
    items.reduce((sum, item) => sum + resolveBranchPurchaseBranchLineTotalKgs(item), 0),
  );
}
