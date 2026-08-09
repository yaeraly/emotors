import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeBranchPurchaseReviewedLineAmountKgs,
  resolveBranchPurchaseReviewedLineAmountKgs,
  sumBranchPurchaseReviewedLineAmountsKgs,
} from './branch-purchase-review-totals.util';

describe('computeBranchPurchaseReviewedLineAmountKgs', () => {
  it('uses approved quantity times branch price for reviewed franchise lines', () => {
    assert.equal(
      computeBranchPurchaseReviewedLineAmountKgs({
        approvedQuantity: 6,
        resolvedBranchPriceKgs: 10000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      }),
      60000,
    );
  });

  it('returns zero for rejected lines', () => {
    assert.equal(
      computeBranchPurchaseReviewedLineAmountKgs({
        approvedQuantity: 0,
        resolvedBranchPriceKgs: 10000,
      }),
      0,
    );
  });
});

describe('sumBranchPurchaseReviewedLineAmountsKgs', () => {
  it('sums all reviewed line amounts for the full order total', () => {
    const total = sumBranchPurchaseReviewedLineAmountsKgs([
      { approvedQuantity: 10, resolvedBranchPriceKgs: 1000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 5, resolvedBranchPriceKgs: 2000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 3, resolvedBranchPriceKgs: 5000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
    ]);
    assert.equal(total, 35000);
  });

  it('recalculates full order total after one line changes and another is rejected', () => {
    const afterChangeA = sumBranchPurchaseReviewedLineAmountsKgs([
      { approvedQuantity: 6, resolvedBranchPriceKgs: 1000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 5, resolvedBranchPriceKgs: 2000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 3, resolvedBranchPriceKgs: 5000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
    ]);
    assert.equal(afterChangeA, 31000);

    const afterRejectB = sumBranchPurchaseReviewedLineAmountsKgs([
      { approvedQuantity: 6, resolvedBranchPriceKgs: 1000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 0, resolvedBranchPriceKgs: 2000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 3, resolvedBranchPriceKgs: 5000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
    ]);
    assert.equal(afterRejectB, 21000);

    const afterReapproveB = sumBranchPurchaseReviewedLineAmountsKgs([
      { approvedQuantity: 6, resolvedBranchPriceKgs: 1000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 4, resolvedBranchPriceKgs: 2000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
      { approvedQuantity: 3, resolvedBranchPriceKgs: 5000, branchType: 'FRANCHISE', hasPricingPolicyAtReview: true },
    ]);
    assert.equal(afterReapproveB, 29000);
  });
});

describe('resolveBranchPurchaseReviewedLineAmountKgs', () => {
  it('prefers persisted approved line total over requested totalAmount', () => {
    assert.equal(
      resolveBranchPurchaseReviewedLineAmountKgs({
        approvedQuantity: 8,
        approvedLineTotalKgs: 80000,
        totalAmount: 100000,
        resolvedBranchPriceKgs: 10000,
      }),
      80000,
    );
  });
});
