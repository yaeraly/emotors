import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { resolveBranchPurchaseLinePayableAmount } from './branch-purchase-estimated-amount.util';
import { resolveBranchPurchaseBranchUnitPriceKgs } from './branch-purchase-branch-display.util';

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
