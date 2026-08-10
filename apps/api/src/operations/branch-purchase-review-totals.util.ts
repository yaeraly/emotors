import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { shouldTransferBranchPurchaseAtCost } from './branch-purchase-estimated-amount.util';
import { resolveBranchPurchaseBranchUnitPriceKgs } from './branch-purchase-branch-display.util';

export function resolveBranchPurchaseHqReviewEffectiveQuantity(item: {
  quantity: number;
  approvedQuantity?: number | null;
  lineStatus?: BranchPurchaseRequestLineStatus | string | null;
}): number {
  const requested = Math.max(Number(item.quantity ?? 0), 0);
  const status = item.lineStatus ?? BranchPurchaseRequestLineStatus.PENDING_REVIEW;

  if (
    status === BranchPurchaseRequestLineStatus.REJECTED ||
    status === BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES ||
    status === 'REJECTED' ||
    status === 'REMOVED_BY_HQ_SALES'
  ) {
    return 0;
  }

  if (
    status === BranchPurchaseRequestLineStatus.APPROVED ||
    status === BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED ||
    status === 'APPROVED' ||
    status === 'PARTIALLY_APPROVED'
  ) {
    return Math.max(Number(item.approvedQuantity ?? 0), 0);
  }

  return requested;
}

function isReviewedBranchPurchaseLineStatus(
  lineStatus?: BranchPurchaseRequestLineStatus | string | null,
): boolean {
  return Boolean(lineStatus && lineStatus !== BranchPurchaseRequestLineStatus.PENDING_REVIEW);
}

/**
 * Frozen order-line unit price snapshot from Branch Sales submit.
 * Derived from persisted submit line total ÷ requested quantity — never current catalog/policy.
 */
export function resolveBranchPurchaseSavedOrderLineUnitPriceKgs(item: {
  quantity: number;
  totalAmount?: unknown;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  estimatedLineProductCostKgs?: unknown;
  branchType?: string | null;
}): number | null {
  const requestedQty = Math.max(Number(item.quantity ?? 0), 0);
  const submitLineTotal = resolveBranchPurchaseSavedSubmitLineTotalKgs(item);
  if (submitLineTotal > 0 && requestedQty > 0) {
    return deriveDisplayUnitCost(submitLineTotal, requestedQty);
  }
  return resolveBranchPurchaseBranchUnitPriceKgs({
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
  });
}

/**
 * Submit-time line total snapshot frozen on the order line.
 * HQ_BRANCH: payable line total at create (estimatedLineProductCostKgs / totalAmount), not catalog unit×qty.
 */
export function resolveBranchPurchaseSavedSubmitLineTotalKgs(item: {
  quantity: number;
  totalAmount?: unknown;
  estimatedLineProductCostKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  branchPurchasePriceKgs?: unknown;
  branchType?: string | null;
}): number {
  const requestedQty = Math.max(Number(item.quantity ?? 0), 0);
  const storedTotal = roundDisplayMoney(Number(item.totalAmount ?? 0));
  const fifoSnapshot = roundDisplayMoney(Number(item.estimatedLineProductCostKgs ?? 0));
  const catalogUnit = resolveBranchPurchaseBranchUnitPriceKgs({
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
  });
  const catalogTotal =
    catalogUnit != null && requestedQty > 0 ? roundDisplayMoney(catalogUnit * requestedQty) : 0;

  if (shouldTransferBranchPurchaseAtCost(item.branchType)) {
    // Repair path: totalAmount may have been overwritten by wrong catalog unit×qty (67870.14).
    if (fifoSnapshot > 0 && (storedTotal <= 0 || (catalogTotal > 0 && storedTotal === catalogTotal && fifoSnapshot !== catalogTotal))) {
      return fifoSnapshot;
    }
    if (storedTotal > 0) return storedTotal;
    return fifoSnapshot;
  }

  return storedTotal > 0 ? storedTotal : 0;
}

/**
 * Authoritative approved line total for every BPR lifecycle stage.
 *
 *   approvedLineTotal = effectiveQuantity × savedOrderLineUnitPrice
 *
 * where savedOrderLineUnitPrice is frozen from submit line total (never live catalog/FIFO re-read).
 * Downstream roles (HQ Sales, Branch Sales, Branch Accountant, invoice) must consume this result.
 */
export function computeBranchPurchaseHqReviewLineAmountKgs(item: {
  quantity: number;
  approvedQuantity?: number | null;
  lineStatus?: BranchPurchaseRequestLineStatus | string | null;
  resolvedBranchPriceKgs?: unknown;
  branchPurchasePriceKgs?: unknown;
  totalAmount?: unknown;
  approvedLineTotalKgs?: unknown;
  estimatedLineProductCostKgs?: unknown;
  hasPricingPolicyAtReview?: boolean | null;
  branchType?: string | null;
}): number {
  const effectiveQuantity = resolveBranchPurchaseHqReviewEffectiveQuantity(item);
  if (effectiveQuantity <= 0) {
    return 0;
  }

  if (isReviewedBranchPurchaseLineStatus(item.lineStatus) && item.approvedLineTotalKgs != null) {
    const persisted = roundDisplayMoney(Number(item.approvedLineTotalKgs));
    const requestedQty = Math.max(Number(item.quantity ?? 0), 0);
    const submitLineTotal = resolveBranchPurchaseSavedSubmitLineTotalKgs(item);
    const expectedFromSnapshot =
      submitLineTotal > 0 && requestedQty > 0
        ? roundDisplayMoney((submitLineTotal * effectiveQuantity) / requestedQty)
        : 0;
    if (persisted > 0 && (expectedFromSnapshot <= 0 || persisted === expectedFromSnapshot)) {
      return persisted;
    }
  }

  const requestedQty = Math.max(Number(item.quantity ?? 0), 0);
  const submitLineTotal = resolveBranchPurchaseSavedSubmitLineTotalKgs(item);
  if (submitLineTotal > 0 && requestedQty > 0) {
    return roundDisplayMoney((submitLineTotal * effectiveQuantity) / requestedQty);
  }

  const savedUnit = resolveBranchPurchaseSavedOrderLineUnitPriceKgs(item);
  if (savedUnit != null && savedUnit > 0) {
    return roundDisplayMoney(savedUnit * effectiveQuantity);
  }

  return 0;
}

export function sumBranchPurchaseHqReviewLineAmountsKgs(
  items: Array<Parameters<typeof computeBranchPurchaseHqReviewLineAmountKgs>[0]>,
): number {
  return sumDisplayMoneyTotals(items.map((item) => computeBranchPurchaseHqReviewLineAmountKgs(item)));
}

/** @deprecated Prefer computeBranchPurchaseHqReviewLineAmountKgs with line status. */
export function computeBranchPurchaseReviewedLineAmountKgs(item: {
  approvedQuantity?: number | null;
  resolvedBranchPriceKgs?: unknown;
  branchPurchasePriceKgs?: unknown;
  totalAmount?: unknown;
  approvedLineTotalKgs?: unknown;
  estimatedLineProductCostKgs?: unknown;
  hasPricingPolicyAtReview?: boolean | null;
  branchType?: string | null;
  quantity?: number;
}): number {
  return computeBranchPurchaseHqReviewLineAmountKgs({
    quantity: Math.max(Number(item.quantity ?? item.approvedQuantity ?? 0), 0),
    approvedQuantity: item.approvedQuantity,
    lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    totalAmount: item.totalAmount,
    approvedLineTotalKgs: item.approvedLineTotalKgs,
    estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
    hasPricingPolicyAtReview: item.hasPricingPolicyAtReview,
    branchType: item.branchType,
  });
}

export function sumBranchPurchaseReviewedLineAmountsKgs(
  items: Array<Parameters<typeof computeBranchPurchaseReviewedLineAmountKgs>[0]>,
): number {
  return sumDisplayMoneyTotals(items.map((item) => computeBranchPurchaseReviewedLineAmountKgs(item)));
}

export function resolveBranchPurchaseReviewedLineAmountKgs(item: {
  quantity?: number;
  approvedQuantity?: number | null;
  approvedLineTotalKgs?: unknown;
  totalAmount?: unknown;
  resolvedBranchPriceKgs?: unknown;
  branchPurchasePriceKgs?: unknown;
  estimatedLineProductCostKgs?: unknown;
  hasPricingPolicyAtReview?: boolean | null;
  branchType?: string | null;
  lineStatus?: BranchPurchaseRequestLineStatus | string | null;
}): number {
  return computeBranchPurchaseHqReviewLineAmountKgs({
    quantity: Math.max(Number(item.quantity ?? 0), 0),
    approvedQuantity: item.approvedQuantity,
    lineStatus: item.lineStatus ?? BranchPurchaseRequestLineStatus.APPROVED,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    totalAmount: item.totalAmount,
    approvedLineTotalKgs: item.approvedLineTotalKgs,
    estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
    hasPricingPolicyAtReview: item.hasPricingPolicyAtReview,
    branchType: item.branchType,
  });
}

/**
 * Lifecycle money invariant: status transitions must not change the authoritative
 * total unless approved quantity or saved line price intentionally changed.
 */
export function assertBranchPurchaseAuthoritativeTotalUnchanged(
  beforeTotalKgs: number,
  afterTotalKgs: number,
  options?: { quantityOrPriceChanged?: boolean },
): { ok: boolean; beforeKgs: number; afterKgs: number; differenceKgs: number } {
  const beforeKgs = roundDisplayMoney(Number(beforeTotalKgs ?? 0));
  const afterKgs = roundDisplayMoney(Number(afterTotalKgs ?? 0));
  const differenceKgs = roundDisplayMoney(afterKgs - beforeKgs);
  if (options?.quantityOrPriceChanged) {
    return { ok: true, beforeKgs, afterKgs, differenceKgs };
  }
  return {
    ok: Math.abs(differenceKgs) <= 0,
    beforeKgs,
    afterKgs,
    differenceKgs,
  };
}
