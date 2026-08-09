import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import { roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';
import { resolveBranchPurchaseLinePayableAmount } from './branch-purchase-estimated-amount.util';
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

export function computeBranchPurchaseHqReviewLineAmountKgs(item: {
  quantity: number;
  approvedQuantity?: number | null;
  lineStatus?: BranchPurchaseRequestLineStatus | string | null;
  resolvedBranchPriceKgs?: unknown;
  branchPurchasePriceKgs?: unknown;
  estimatedLineProductCostKgs?: unknown;
  hasPricingPolicyAtReview?: boolean | null;
  branchType?: string | null;
}): number {
  const effectiveQuantity = resolveBranchPurchaseHqReviewEffectiveQuantity(item);
  if (effectiveQuantity <= 0) {
    return 0;
  }

  const unitPrice = resolveBranchPurchaseBranchUnitPriceKgs({
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
  });

  return resolveBranchPurchaseLinePayableAmount({
    branchType: item.branchType,
    quantity: effectiveQuantity,
    estimatedLineProductCostKgs:
      item.estimatedLineProductCostKgs != null ? Number(item.estimatedLineProductCostKgs) : null,
    unitPriceKgs: unitPrice,
    hasPricingPolicy: item.hasPricingPolicyAtReview !== false,
  });
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
  estimatedLineProductCostKgs?: unknown;
  hasPricingPolicyAtReview?: boolean | null;
  branchType?: string | null;
}): number {
  return computeBranchPurchaseHqReviewLineAmountKgs({
    quantity: Math.max(Number(item.approvedQuantity ?? 0), 0),
    approvedQuantity: item.approvedQuantity,
    lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
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
  approvedQuantity?: number | null;
  approvedLineTotalKgs?: unknown;
  totalAmount?: unknown;
  resolvedBranchPriceKgs?: unknown;
  branchPurchasePriceKgs?: unknown;
  estimatedLineProductCostKgs?: unknown;
  hasPricingPolicyAtReview?: boolean | null;
  branchType?: string | null;
}): number {
  const approvedQuantity = Math.max(Number(item.approvedQuantity ?? 0), 0);
  if (approvedQuantity <= 0) {
    return 0;
  }

  if (item.approvedLineTotalKgs != null) {
    return roundDisplayMoney(Number(item.approvedLineTotalKgs));
  }

  const storedTotal = roundDisplayMoney(Number(item.totalAmount ?? 0));
  if (storedTotal > 0) {
    return storedTotal;
  }

  return computeBranchPurchaseReviewedLineAmountKgs({
    approvedQuantity: item.approvedQuantity,
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
    hasPricingPolicyAtReview: item.hasPricingPolicyAtReview,
    branchType: item.branchType,
  });
}
