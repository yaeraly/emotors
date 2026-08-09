import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveBranchPurchaseReviewedLineAmountKgs } from './branch-purchase-review-totals.util';

describe('resolveBranchPurchaseReviewedLineAmountKgs', () => {
  it('uses approved quantity times branch price for reviewed franchise lines', () => {
    assert.equal(
      resolveBranchPurchaseReviewedLineAmountKgs({
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
      resolveBranchPurchaseReviewedLineAmountKgs({
        approvedQuantity: 0,
        totalAmount: 80000,
        resolvedBranchPriceKgs: 10000,
      }),
      0,
    );
  });

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
