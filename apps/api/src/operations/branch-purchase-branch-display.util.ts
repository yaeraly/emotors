import { roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';

/** CEO-approved branch unit price frozen on the order line (never wholesale/cost). */
export function resolveBranchPurchaseBranchUnitPriceKgs(item: {
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  /** Create/save snapshot of Цена для филиала (DB column; same value written at draft save). */
  wholesalePriceKgs?: unknown;
}): number | null {
  // Prefer explicit saved branch-price snapshot fields. Never invent from FIFO/catalog here.
  const raw =
    item.resolvedBranchPriceKgs ?? item.branchPurchasePriceKgs ?? item.wholesalePriceKgs;
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
  wholesalePriceKgs?: unknown;
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
    wholesalePriceKgs?: unknown;
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
 * Invariant: draftQuantity × saved/displayed Цена для филиала = line Сумма.
 *
 * Never use live FIFO/catalog cost for draft list/detail (that produced stale
 * 72823.21 while saved qty × branch price correctly showed 72490.50).
 */
export function resolveBranchPurchaseDraftLineTotalKgs(item: {
  quantity: number;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  wholesalePriceKgs?: unknown;
  totalAmount?: unknown;
  estimatedLineProductCostKgs?: unknown;
  branchType?: string | null;
  hasPricingPolicy?: boolean | null;
}): number {
  const commercial = resolveBranchPurchaseCommercialLineTotalKgs(item);
  if (commercial > 0) {
    return commercial;
  }
  // Only when no saved branch unit price exists — keep previously persisted line total.
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
