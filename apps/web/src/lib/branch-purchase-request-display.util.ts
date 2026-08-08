import { formatKgsLocalized, roundMoney } from '@/lib/money';

export type BranchPurchaseRequestLinePricing = {
  quantity: number;
  totalAmount?: number | null;
  resolvedBranchPriceKgs?: number | null;
  branchPurchasePriceKgs?: number;
  hasPricingPolicyAtSubmit?: boolean;
  pricingPolicyAvailable?: boolean;
};

/** Draft create/edit form line — quantity is edited as string in the UI. */
export type DraftFormLinePricing = {
  productId?: string;
  quantity: string | number;
  branchPurchasePriceKgs?: number | null;
  /** Authoritative FIFO/payable line total from backend — never recompute as unit×qty for HQ at-cost. */
  authoritativeLineTotalKgs?: number | null;
  pricingPending?: boolean;
  priceResolving?: boolean;
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

function parseDraftFormQuantity(quantity: string | number): number {
  const qty = Number(quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/** Branch price shown in the draft form row (matches formatBranchPrice inputs). */
export function getDraftFormBranchPrice(line: DraftFormLinePricing): number | null {
  if (!line.productId) return null;
  if (line.priceResolving || line.pricingPending) return null;
  const raw = line.branchPurchasePriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

/**
 * Row total for NEW/DRAFT form (restore 0007a11 architecture):
 * Prefer backend FIFO/payable `authoritativeLineTotalKgs` / `lineTotalKgs`.
 * Only fall back to quantity × displayed branch price when no authoritative total exists
 * (franchise create flow before prices load). Never rebuild HQ at-cost totals from rounded units.
 */
export function draftFormLineTotal(line: DraftFormLinePricing): number {
  const authoritative = line.authoritativeLineTotalKgs;
  if (authoritative != null && Number.isFinite(Number(authoritative)) && Number(authoritative) > 0) {
    return roundMoney(Number(authoritative));
  }
  const price = getDraftFormBranchPrice(line);
  if (price == null) return 0;
  const qty = parseDraftFormQuantity(line.quantity);
  if (qty <= 0) return 0;
  return roundMoney(qty * price);
}

/** Bottom total for NEW/DRAFT form: sum of authoritative/derived line totals. */
export function draftFormOrderTotal(lines: DraftFormLinePricing[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + draftFormLineTotal(line), 0));
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
