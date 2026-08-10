import { formatKgsLocalized, roundMoney } from '@/lib/money';

export type BranchPurchaseRequestLinePricing = {
  quantity: number;
  totalAmount?: number | null;
  resolvedBranchPriceKgs?: number | null;
  branchPurchasePriceKgs?: number;
  hasPricingPolicyAtSubmit?: boolean;
  pricingPolicyAvailable?: boolean;
  lineStatus?: string | null;
  approvedQuantity?: number | null;
  approvedLineTotalKgs?: number | null;
};

/** Draft create/edit form line — quantity is edited as string in the UI. */
export type DraftFormLinePricing = {
  productId?: string;
  quantity: string | number;
  branchPurchasePriceKgs?: number | null;
  /** Optional backend FIFO/payable total; Branch Sales create/draft UI ignores this when branch price is known. */
  authoritativeLineTotalKgs?: number | null;
  pricingPending?: boolean;
  priceResolving?: boolean;
};

export function isPendingHqSalesReviewRequest(status?: string | null): boolean {
  return status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ';
}

/** Quantity shown in Branch Sales Manager order-detail rows. */
export function getDisplayQuantity(item: BranchPurchaseRequestLinePricing): number {
  return item.quantity;
}

/** Effective quantity for branch order display after HQ Sales review. */
export function getBranchOrderDisplayQuantity(
  item: BranchPurchaseRequestLinePricing,
  options?: { reviewed?: boolean },
): number {
  if (options?.reviewed) {
    return hqReviewEffectiveQuantity(item);
  }
  return getDisplayQuantity(item);
}

export type BranchOrderTotalOptions = {
  requestStatus?: string | null;
  reviewed?: boolean;
  totalEstimatedAmount?: number | null;
};

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

/** HQ Sales has persisted a per-line review decision (not pending review). */
export function isReviewedBranchPurchaseLine(item: Pick<BranchPurchaseRequestLinePricing, 'lineStatus'>) {
  return Boolean(item.lineStatus && item.lineStatus !== 'PENDING_REVIEW');
}

/**
 * Effective quantity for HQ Sales row/order amounts:
 * pending → requested; approved/partial → approved; rejected → 0.
 */
export function hqReviewEffectiveQuantity(item: BranchPurchaseRequestLinePricing): number {
  const requested = Math.max(Number(item.quantity ?? 0), 0);
  const status = item.lineStatus ?? 'PENDING_REVIEW';

  if (status === 'REJECTED' || status === 'REMOVED_BY_HQ_SALES') {
    return 0;
  }
  if (status === 'APPROVED' || status === 'PARTIALLY_APPROVED') {
    return Math.max(Number(item.approvedQuantity ?? 0), 0);
  }
  return requested;
}

/**
 * HQ Sales review table amount for one line.
 * Pending: Запрос × цена; reviewed: Утв. × цена; rejected: 0.
 */
export function hqReviewLineAmount(item: BranchPurchaseRequestLinePricing): number {
  const effectiveQuantity = hqReviewEffectiveQuantity(item);
  if (effectiveQuantity <= 0) {
    return 0;
  }

  if (isReviewedBranchPurchaseLine(item)) {
    if (item.approvedLineTotalKgs != null && Number.isFinite(Number(item.approvedLineTotalKgs))) {
      return roundMoney(Number(item.approvedLineTotalKgs));
    }
    if (item.totalAmount != null && Number.isFinite(Number(item.totalAmount)) && Number(item.totalAmount) > 0) {
      return roundMoney(Number(item.totalAmount));
    }
  } else if (item.totalAmount != null && Number.isFinite(Number(item.totalAmount)) && Number(item.totalAmount) > 0) {
    return roundMoney(Number(item.totalAmount));
  }

  const price = getFrozenBranchPrice(item);
  if (price == null) {
    return 0;
  }

  return roundMoney(price * effectiveQuantity);
}

/** HQ Sales order amount: always the sum of all displayed row amounts. */
export function hqReviewOrderAmount(items: BranchPurchaseRequestLinePricing[]): number {
  return roundMoney(items.reduce((sum, item) => sum + hqReviewLineAmount(item), 0));
}

/** Pre–HQ Sales review branch view: requested qty × displayed branch price. */
export function pendingBranchReviewLineTotal(item: BranchPurchaseRequestLinePricing): number {
  const price = getFrozenBranchPrice(item);
  const qty = getDisplayQuantity(item);
  if (price != null && qty > 0) {
    return roundMoney(price * qty);
  }
  const authoritative =
    item.totalAmount != null && Number.isFinite(Number(item.totalAmount))
      ? Number(item.totalAmount)
      : null;
  if (authoritative != null && authoritative > 0) {
    return roundMoney(authoritative);
  }
  return 0;
}

/**
 * Authoritative branch order line total — uses API presenter `totalAmount` when available.
 * Falls back to HQ review math or pre-submit qty×price only when API total is absent
 * (e.g. draft create form preview before prices load).
 */
export function branchOrderLineTotal(
  item: BranchPurchaseRequestLinePricing,
  options?: BranchOrderTotalOptions,
): number {
  const fromApi =
    item.totalAmount != null && Number.isFinite(Number(item.totalAmount)) && Number(item.totalAmount) > 0
      ? roundMoney(Number(item.totalAmount))
      : null;
  if (fromApi != null) {
    return fromApi;
  }
  const pendingHqReview =
    options?.requestStatus != null && isPendingHqSalesReviewRequest(options.requestStatus);
  if (pendingHqReview && !options?.reviewed) {
    return pendingBranchReviewLineTotal(item);
  }
  return hqReviewLineAmount(item);
}

/** Authoritative branch order total — always equals sum of displayed line totals. */
export function branchOrderTotal(
  items: BranchPurchaseRequestLinePricing[],
  options?: BranchOrderTotalOptions,
): number {
  return roundMoney(items.reduce((sum, item) => sum + branchOrderLineTotal(item, options), 0));
}

/** @deprecated Prefer branchOrderLineTotal with request context. */
export function requestLineTotal(
  item: BranchPurchaseRequestLinePricing,
  options?: BranchOrderTotalOptions,
): number {
  return branchOrderLineTotal(item, options);
}

/** @deprecated Prefer branchOrderTotal with request context. */
export function requestOrderTotal(
  items: BranchPurchaseRequestLinePricing[],
  options?: BranchOrderTotalOptions,
): number {
  return branchOrderTotal(items, options);
}

function parseDraftFormQuantity(quantity: string | number): number {
  const qty = Number(quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/**
 * Branch price shown in the draft/create form row (matches formatBranchPrice inputs).
 * Keep a known price while a background refresh runs so qty edits update Сумма immediately.
 */
export function getDraftFormBranchPrice(line: DraftFormLinePricing): number | null {
  if (!line.productId) return null;
  if (line.pricingPending) return null;
  if (line.priceResolving && (line.branchPurchasePriceKgs == null || Number(line.branchPurchasePriceKgs) <= 0)) {
    return null;
  }
  const raw = line.branchPurchasePriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

/**
 * Row total for NEW/DRAFT create form:
 * displayed quantity × displayed Цена для филиала.
 * Do not use FIFO/landed `authoritativeLineTotalKgs` here — that field can disagree with the
 * unit price shown in the same row (e.g. 630.15 vs 2 × 1963.59).
 */
export function draftFormLineTotal(line: DraftFormLinePricing): number {
  const price = getDraftFormBranchPrice(line);
  const qty = parseDraftFormQuantity(line.quantity);
  if (price != null && qty > 0) {
    return roundMoney(qty * price);
  }
  const authoritative = line.authoritativeLineTotalKgs;
  if (authoritative != null && Number.isFinite(Number(authoritative)) && Number(authoritative) > 0) {
    return roundMoney(Number(authoritative));
  }
  return 0;
}

/** Bottom total for NEW/DRAFT form: sum of current row totals (qty × branch price). */
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

export function formatLineTotalKgs(
  item: BranchPurchaseRequestLinePricing,
  options?: BranchOrderTotalOptions,
): string {
  return formatKgsLocalized(branchOrderLineTotal(item, options));
}

export function formatOrderTotalKgs(
  items: BranchPurchaseRequestLinePricing[],
  options?: BranchOrderTotalOptions,
): string {
  return formatKgsLocalized(branchOrderTotal(items, options));
}
