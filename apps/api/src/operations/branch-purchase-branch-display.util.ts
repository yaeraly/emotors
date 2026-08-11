import { roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';

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

/**
 * Create-form / pre–HQ Sales commercial line total:
 * requestedQuantity × frozen order-line Цена для филиала.
 */
export function resolveBranchPurchaseCommercialLineTotalKgs(item: {
  quantity: number;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
}): number {
  const quantity = resolveBranchPurchaseBranchDisplayQuantity(item);
  const unitPrice = resolveBranchPurchaseBranchUnitPriceKgs(item);
  if (unitPrice != null && quantity > 0) {
    return roundDisplayMoney(unitPrice * quantity);
  }
  return 0;
}

export function sumBranchPurchaseCommercialLineTotalsKgs(
  items: Array<{
    quantity: number;
    branchPurchasePriceKgs?: unknown;
    resolvedBranchPriceKgs?: unknown;
  }>,
): number {
  return roundDisplayMoney(
    items.reduce((sum, item) => sum + resolveBranchPurchaseCommercialLineTotalKgs(item), 0),
  );
}

/**
 * Authoritative branch line Сумма: displayed quantity × CEO branch unit price.
 * Commercial total always wins when the frozen branch price is known.
 * FIFO/landed cost must not replace Сумма (kept separately as product cost).
 */
export function resolveBranchPurchaseBranchLineTotalKgs(item: {
  quantity: number;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  totalAmount?: unknown;
  /** @deprecated Ignored for Сумма — commercial qty × branch price is authoritative. */
  transferAtCost?: boolean;
}): number {
  const commercial = resolveBranchPurchaseCommercialLineTotalKgs(item);
  if (commercial > 0) {
    return commercial;
  }
  const stored = roundDisplayMoney(Number(item.totalAmount ?? 0));
  return stored > 0 ? stored : 0;
}

/**
 * Authoritative draft line Сумма (before HQ Sales approval).
 * Invariant: displayed quantity × displayed Цена для филиала = line Сумма.
 * Never use FIFO/cost payable for draft list/detail totals (that produced stale
 * 63148.89 while the open-draft form correctly showed qty × branch price = 72490.50).
 */
export function resolveBranchPurchaseDraftLineTotalKgs(item: {
  quantity: number;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  totalAmount?: unknown;
  estimatedLineProductCostKgs?: unknown;
  branchType?: string | null;
  hasPricingPolicy?: boolean | null;
}): number {
  const commercial = resolveBranchPurchaseCommercialLineTotalKgs(item);
  if (commercial > 0) {
    return commercial;
  }
  const stored = roundDisplayMoney(Number(item.totalAmount ?? 0));
  return stored > 0 ? stored : 0;
}

export function sumBranchPurchaseDraftLineTotalsKgs(
  items: Array<Parameters<typeof resolveBranchPurchaseDraftLineTotalKgs>[0]>,
): number {
  return sumDisplayMoneyTotals(
    items.map((item) => resolveBranchPurchaseDraftLineTotalKgs(item)),
  );
}

export function sumBranchPurchaseBranchLineTotalsKgs(
  items: Array<{
    quantity: number;
    branchPurchasePriceKgs?: unknown;
    resolvedBranchPriceKgs?: unknown;
    totalAmount?: unknown;
    transferAtCost?: boolean;
  }>,
  options?: { transferAtCost?: boolean },
): number {
  return roundDisplayMoney(
    items.reduce(
      (sum, item) =>
        sum +
        resolveBranchPurchaseBranchLineTotalKgs({
          ...item,
          transferAtCost: options?.transferAtCost ?? item.transferAtCost,
        }),
      0,
    ),
  );
}
