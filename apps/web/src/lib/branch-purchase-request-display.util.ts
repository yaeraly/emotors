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

export function isDraftBranchPurchaseRequest(status?: string | null): boolean {
  return status === 'DRAFT';
}

/** CEO-approved branch price frozen on the line (never wholesale/retail/cost). */
export function getFrozenBranchPrice(item: BranchPurchaseRequestLinePricing): number | null {
  const raw = item.branchPurchasePriceKgs ?? item.resolvedBranchPriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
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
 * Prefer persisted authoritative commercial totals from the API.
 * Fall back to effectiveQuantity × frozen Цена для филиала only when no snapshot exists.
 * Never reconstruct from live Product Catalog / Pricing Policy / FIFO cost.
 */
export function hqReviewLineAmount(item: BranchPurchaseRequestLinePricing): number {
  const effectiveQuantity = hqReviewEffectiveQuantity(item);
  if (effectiveQuantity <= 0) {
    return 0;
  }

  // Always prefer persisted authoritative line totals over unit × qty reconstruction.
  if (isReviewedBranchPurchaseLine(item)) {
    if (item.approvedLineTotalKgs != null && Number.isFinite(Number(item.approvedLineTotalKgs))) {
      return roundMoney(Number(item.approvedLineTotalKgs));
    }
  }
  if (item.totalAmount != null && Number.isFinite(Number(item.totalAmount)) && Number(item.totalAmount) > 0) {
    return roundMoney(Number(item.totalAmount));
  }

  const price = getFrozenBranchPrice(item);
  if (price == null) {
    return 0;
  }

  // Last-resort draft preview only — never an accounting source when totals exist.
  return roundMoney(price * effectiveQuantity);
}

/** HQ Sales order amount: always the sum of all displayed row amounts. */
export function hqReviewOrderAmount(items: BranchPurchaseRequestLinePricing[]): number {
  return roundMoney(items.reduce((sum, item) => sum + hqReviewLineAmount(item), 0));
}

export type HqReviewPreviewDraft = {
  /** Local Утв. draft; empty string means “not typing a value”. */
  draftApprovedQuantity?: number | '' | null;
  /** Local action draft (REJECT/REMOVE → preview 0 before refetch). */
  decisionAction?: string | null;
};

/**
 * Live preview quantity while HQ Sales edits Утв.
 * Typed draft wins; empty draft falls back to persisted/requested rules (never forced 0).
 */
export function hqReviewPreviewEffectiveQuantity(
  item: BranchPurchaseRequestLinePricing,
  draft?: HqReviewPreviewDraft,
): number {
  if (draft?.decisionAction === 'REJECT' || draft?.decisionAction === 'REMOVE') {
    return 0;
  }
  const raw = draft?.draftApprovedQuantity;
  if (raw !== '' && raw != null && Number.isFinite(Number(raw))) {
    return Math.max(Number(raw), 0);
  }
  return hqReviewEffectiveQuantity(item);
}

/**
 * Live row Сумма while editing Утв.
 * Empty input keeps the previous persisted/requested amount (does not force 0).
 * When a draft qty equals the current effective qty, keep the persisted authoritative total
 * so typing does not thrash a correct commercial snapshot.
 */
export function hqReviewPreviewLineAmount(
  item: BranchPurchaseRequestLinePricing,
  draft?: HqReviewPreviewDraft,
): number {
  if (draft?.decisionAction === 'REJECT' || draft?.decisionAction === 'REMOVE') {
    return 0;
  }
  if (item.lineStatus === 'REJECTED' || item.lineStatus === 'REMOVED_BY_HQ_SALES') {
    return 0;
  }

  const raw = draft?.draftApprovedQuantity;
  const hasDraft = raw !== '' && raw != null && Number.isFinite(Number(raw));
  if (!hasDraft) {
    return hqReviewLineAmount(item);
  }

  const qty = Math.max(Number(raw), 0);
  if (qty <= 0) {
    return 0;
  }
  if (qty === hqReviewEffectiveQuantity(item)) {
    return hqReviewLineAmount(item);
  }
  const price = getFrozenBranchPrice(item);
  if (price == null) {
    return 0;
  }
  return roundMoney(price * qty);
}

/** Live Сумма заказа = sum of current row preview amounts. */
export function hqReviewPreviewOrderAmount(
  items: Array<BranchPurchaseRequestLinePricing & { id?: string }>,
  draftByItemId?: Record<string, HqReviewPreviewDraft | undefined>,
): number {
  return roundMoney(
    items.reduce((sum, item) => {
      const draft = item.id && draftByItemId ? draftByItemId[item.id] : undefined;
      return sum + hqReviewPreviewLineAmount(item, draft);
    }, 0),
  );
}

/**
 * Pre–HQ Sales review branch line Сумма.
 * Prefer persisted API totalAmount (commercial snapshot) over reconstructing
 * from current catalog/FIFO sources.
 */
export function pendingBranchReviewLineTotal(item: BranchPurchaseRequestLinePricing): number {
  const authoritative =
    item.totalAmount != null && Number.isFinite(Number(item.totalAmount))
      ? Number(item.totalAmount)
      : null;
  if (authoritative != null && authoritative > 0) {
    return roundMoney(authoritative);
  }
  const price = getFrozenBranchPrice(item);
  const qty = getDisplayQuantity(item);
  if (price != null && qty > 0) {
    return roundMoney(price * qty);
  }
  return 0;
}

/**
 * Authoritative branch order line total — same rules as HQ Sales after review.
 * DRAFT: always displayed quantity × Цена для филиала (matches open-draft form).
 * Before HQ Sales review (submitted): prefer persisted API totalAmount when present.
 */
export function branchOrderLineTotal(
  item: BranchPurchaseRequestLinePricing,
  options?: BranchOrderTotalOptions,
): number {
  if (isDraftBranchPurchaseRequest(options?.requestStatus)) {
    const price = getFrozenBranchPrice(item);
    const qty = getDisplayQuantity(item);
    if (price != null && qty > 0) {
      return roundMoney(price * qty);
    }
    if (item.totalAmount != null && Number.isFinite(Number(item.totalAmount)) && Number(item.totalAmount) > 0) {
      return roundMoney(Number(item.totalAmount));
    }
    return 0;
  }
  const pendingHqReview =
    options?.requestStatus != null && isPendingHqSalesReviewRequest(options.requestStatus);
  if (pendingHqReview && !options?.reviewed) {
    if (item.totalAmount != null && Number.isFinite(Number(item.totalAmount)) && Number(item.totalAmount) > 0) {
      return roundMoney(Number(item.totalAmount));
    }
    return pendingBranchReviewLineTotal(item);
  }
  return hqReviewLineAmount(item);
}

/** Authoritative branch order total — matches HQ Sales / API `totalEstimatedAmount`. */
export function branchOrderTotal(
  items: BranchPurchaseRequestLinePricing[],
  options?: BranchOrderTotalOptions,
): number {
  if (options?.reviewed) {
    const header = options.totalEstimatedAmount;
    if (header != null && Number.isFinite(Number(header)) && Number(header) > 0) {
      return roundMoney(Number(header));
    }
  }
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

/** Sum of all line requested quantities (product units, not position count). */
export function sumBranchPurchaseRequestedQuantity(
  items: Array<Pick<BranchPurchaseRequestLinePricing, 'quantity'>>,
  totalQuantity?: number | null,
): number {
  if (totalQuantity != null && Number.isFinite(Number(totalQuantity))) {
    return Math.max(Number(totalQuantity), 0);
  }
  return items.reduce((sum, item) => sum + Math.max(Number(item.quantity ?? 0), 0), 0);
}

/** Sum of persisted approved quantities; rejected lines contribute 0. */
export function sumBranchPurchaseApprovedQuantity(
  items: Array<Pick<BranchPurchaseRequestLinePricing, 'approvedQuantity'>>,
): number {
  return items.reduce((sum, item) => sum + Math.max(Number(item.approvedQuantity ?? 0), 0), 0);
}

export function isPartiallyApprovedBranchPurchaseLine(
  item: Pick<BranchPurchaseRequestLinePricing, 'quantity' | 'approvedQuantity' | 'lineStatus'>,
): boolean {
  const requested = Math.max(Number(item.quantity ?? 0), 0);
  const approved = Math.max(Number(item.approvedQuantity ?? 0), 0);
  if (requested <= 0 || approved <= 0) return false;
  if (item.lineStatus === 'REJECTED' || item.lineStatus === 'REMOVED_BY_HQ_SALES') return false;
  return approved < requested;
}

export function isRejectedBranchPurchaseReviewLine(
  item: Pick<BranchPurchaseRequestLinePricing, 'approvedQuantity' | 'lineStatus'>,
): boolean {
  if (item.lineStatus === 'REJECTED' || item.lineStatus === 'REMOVED_BY_HQ_SALES') {
    return true;
  }
  return Math.max(Number(item.approvedQuantity ?? 0), 0) <= 0;
}

export function isFullyApprovedBranchPurchaseReviewLine(
  item: Pick<BranchPurchaseRequestLinePricing, 'quantity' | 'approvedQuantity' | 'lineStatus'>,
): boolean {
  if (isRejectedBranchPurchaseReviewLine(item)) return false;
  if (isPartiallyApprovedBranchPurchaseLine(item)) return false;
  const requested = Math.max(Number(item.quantity ?? 0), 0);
  const approved = Math.max(Number(item.approvedQuantity ?? 0), 0);
  return requested > 0 && approved >= requested;
}

/** Branch Sales review table display priority: rejected → partial → full. */
export function branchSalesManagerReviewLineDisplayPriority(
  item: Pick<BranchPurchaseRequestLinePricing, 'quantity' | 'approvedQuantity' | 'lineStatus'>,
): 0 | 1 | 2 {
  if (isRejectedBranchPurchaseReviewLine(item)) return 0;
  if (isPartiallyApprovedBranchPurchaseLine(item)) return 1;
  return 2;
}

/** Persisted branch review row styling: partial → amber, rejected → red, full approval → normal. */
export function branchSalesManagerReviewLineRowClass(
  item: Pick<BranchPurchaseRequestLinePricing, 'quantity' | 'approvedQuantity' | 'lineStatus'>,
): string {
  if (isRejectedBranchPurchaseReviewLine(item)) {
    return 'bg-red-50';
  }
  if (isPartiallyApprovedBranchPurchaseLine(item)) {
    return 'bg-amber-50';
  }
  return '';
}

/** Stable sort: rejected, then partial, then full — preserving original submission order within each group. */
export function sortBranchSalesManagerReviewItemsByApprovalResult<
  T extends Pick<BranchPurchaseRequestLinePricing, 'quantity' | 'approvedQuantity' | 'lineStatus'>,
>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftPriority = branchSalesManagerReviewLineDisplayPriority(left.item);
      const rightPriority = branchSalesManagerReviewLineDisplayPriority(right.item);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

/** @deprecated Use sortBranchSalesManagerReviewItemsByApprovalResult */
export const sortBranchSalesManagerReviewItemsPartialFirst =
  sortBranchSalesManagerReviewItemsByApprovalResult;

export function getBranchSalesReviewRequestedQuantity(
  item: Pick<BranchPurchaseRequestLinePricing, 'quantity'>,
): number {
  return Math.max(Number(item.quantity ?? 0), 0);
}

export function getBranchSalesReviewApprovedQuantity(
  item: Pick<BranchPurchaseRequestLinePricing, 'approvedQuantity'>,
): number {
  return Math.max(Number(item.approvedQuantity ?? 0), 0);
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
 * Row total for NEW/DRAFT create form.
 *
 * Invariant: Displayed Количество × Displayed Цена для филиала = Displayed Сумма.
 * Uses the same raw numeric branch price shown in the price column — never FIFO/cost
 * lineTotalKgs (that produced 25 × hidden 2071.83 = 51795.79 instead of 25 × 2466.47).
 */
export function draftFormLineTotal(line: DraftFormLinePricing): number {
  const price = getDraftFormBranchPrice(line);
  const qty = parseDraftFormQuantity(line.quantity);
  if (price != null && qty > 0) {
    return roundMoney(qty * price);
  }
  return 0;
}

/** Bottom total for NEW/DRAFT form: sum of displayed row totals. */
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
