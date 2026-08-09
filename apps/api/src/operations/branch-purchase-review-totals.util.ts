import { roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';
import { resolveBranchPurchaseLinePayableAmount } from './branch-purchase-estimated-amount.util';
import { resolveBranchPurchaseBranchUnitPriceKgs } from './branch-purchase-branch-display.util';

export function computeBranchPurchaseReviewedLineAmountKgs(item: {
  approvedQuantity?: number | null;
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

  const unitPrice = resolveBranchPurchaseBranchUnitPriceKgs({
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
  });

  return resolveBranchPurchaseLinePayableAmount({
    branchType: item.branchType,
    quantity: approvedQuantity,
    estimatedLineProductCostKgs:
      item.estimatedLineProductCostKgs != null ? Number(item.estimatedLineProductCostKgs) : null,
    unitPriceKgs: unitPrice,
    hasPricingPolicy: item.hasPricingPolicyAtReview !== false,
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
