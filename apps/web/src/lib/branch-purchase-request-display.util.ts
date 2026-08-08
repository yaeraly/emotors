import { formatKgs, roundMoney } from '@/lib/money';

export type BranchPurchaseRequestLinePricing = {
  quantity: number;
  totalAmount?: number | null;
  resolvedBranchPriceKgs?: number | null;
  wholesalePriceKgs?: number;
  branchPurchasePriceKgs?: number;
  hasPricingPolicyAtSubmit?: boolean;
  pricingPolicyAvailable?: boolean;
};

export function getFrozenBranchPrice(item: BranchPurchaseRequestLinePricing): number | null {
  const raw = item.resolvedBranchPriceKgs ?? item.wholesalePriceKgs ?? item.branchPurchasePriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price)) return null;
  if (price === 0 && item.hasPricingPolicyAtSubmit === false) return null;
  if (price === 0 && item.pricingPolicyAvailable === false) return null;
  return price;
}

export function requestLineTotal(item: BranchPurchaseRequestLinePricing): number {
  if (item.totalAmount != null && Number(item.totalAmount) > 0) {
    return roundMoney(Number(item.totalAmount));
  }
  const price = getFrozenBranchPrice(item);
  if (price == null) return 0;
  return roundMoney(price * item.quantity);
}

export function requestOrderTotal(
  items: BranchPurchaseRequestLinePricing[],
  totalEstimatedAmount?: number | null,
): number {
  if (totalEstimatedAmount != null && Number(totalEstimatedAmount) > 0) {
    return roundMoney(Number(totalEstimatedAmount));
  }
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
  return formatKgs(price);
}
