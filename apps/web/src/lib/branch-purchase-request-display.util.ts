import { formatKgsLocalized, roundMoney } from '@/lib/money';

export type BranchPurchaseRequestLinePricing = {
  quantity: number;
  totalAmount?: number | null;
  resolvedBranchPriceKgs?: number | null;
  branchPurchasePriceKgs?: number;
  hasPricingPolicyAtSubmit?: boolean;
  pricingPolicyAvailable?: boolean;
};

/** Quantity shown in Branch Sales Manager order-detail rows. */
export function getDisplayQuantity(item: BranchPurchaseRequestLinePricing): number {
  return item.quantity;
}

/** CEO-approved branch price frozen on the line (never wholesale/retail/cost). */
export function getFrozenBranchPrice(item: BranchPurchaseRequestLinePricing): number | null {
  const raw = item.branchPurchasePriceKgs ?? item.resolvedBranchPriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price)) return null;
  if (price === 0 && item.hasPricingPolicyAtSubmit === false) return null;
  if (price === 0 && item.pricingPolicyAvailable === false) return null;
  return price;
}

/** Row total: displayed quantity × displayed branch price. */
export function requestLineTotal(item: BranchPurchaseRequestLinePricing): number {
  const price = getFrozenBranchPrice(item);
  if (price == null) return 0;
  return roundMoney(getDisplayQuantity(item) * price);
}

/** Order total: sum of all row totals. */
export function requestOrderTotal(items: BranchPurchaseRequestLinePricing[]): number {
  return roundMoney(items.reduce((sum, item) => sum + requestLineTotal(item), 0));
}

export function formatFrozenBranchPrice(
  item: BranchPurchaseRequestLinePricing,
  t: (key: string) => string,
): string {
  if (item.hasPricingPolicyAtSubmit === false || item.pricingPolicyAvailable === false) {
    return t('branchProductRequest.pricingPending');
  }
  const price = getFrozenBranchPrice(item);
  if (price == null) return t('branchProductRequest.pricingPending');
  return formatKgsLocalized(price);
}

export function formatLineTotalKgs(item: BranchPurchaseRequestLinePricing): string {
  return formatKgsLocalized(requestLineTotal(item));
}

export function formatOrderTotalKgs(items: BranchPurchaseRequestLinePricing[]): string {
  return formatKgsLocalized(requestOrderTotal(items));
}
