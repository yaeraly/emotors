import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import {
  computeBranchPurchaseHqReviewLineAmountKgs,
  resolveBranchPurchaseHqReviewEffectiveQuantity,
  resolveBranchPurchaseReviewedLineAmountKgs,
  sumBranchPurchaseHqReviewLineAmountsKgs,
} from './branch-purchase-review-totals.util';

describe('resolveBranchPurchaseHqReviewEffectiveQuantity', () => {
  it('uses requested quantity before review', () => {
    assert.equal(
      resolveBranchPurchaseHqReviewEffectiveQuantity({
        quantity: 10,
        approvedQuantity: null,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
      }),
      10,
    );
  });

  it('uses approved quantity after approval', () => {
    assert.equal(
      resolveBranchPurchaseHqReviewEffectiveQuantity({
        quantity: 10,
        approvedQuantity: 6,
        lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
      }),
      6,
    );
  });

  it('uses zero after rejection', () => {
    assert.equal(
      resolveBranchPurchaseHqReviewEffectiveQuantity({
        quantity: 10,
        approvedQuantity: 0,
        lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
      }),
      0,
    );
  });
});

describe('sumBranchPurchaseHqReviewLineAmountsKgs', () => {
  it('initial order total uses requested amounts before any review', () => {
    const total = sumBranchPurchaseHqReviewLineAmountsKgs([
      {
        quantity: 10,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
        resolvedBranchPriceKgs: 1000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 5,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
        resolvedBranchPriceKgs: 2000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 3,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
        resolvedBranchPriceKgs: 5000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
    ]);
    assert.equal(total, 35000);
  });

  it('keeps unreviewed rows in order total after partial approval and rejection', () => {
    const afterPartialA = sumBranchPurchaseHqReviewLineAmountsKgs([
      {
        quantity: 10,
        approvedQuantity: 6,
        lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
        resolvedBranchPriceKgs: 1000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 5,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
        resolvedBranchPriceKgs: 2000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 3,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
        resolvedBranchPriceKgs: 5000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
    ]);
    assert.equal(afterPartialA, 31000);

    const afterRejectB = sumBranchPurchaseHqReviewLineAmountsKgs([
      {
        quantity: 10,
        approvedQuantity: 6,
        lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
        resolvedBranchPriceKgs: 1000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 5,
        approvedQuantity: 0,
        lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
        resolvedBranchPriceKgs: 2000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 3,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
        resolvedBranchPriceKgs: 5000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
    ]);
    assert.equal(afterRejectB, 21000);

    const afterApproveC = sumBranchPurchaseHqReviewLineAmountsKgs([
      {
        quantity: 10,
        approvedQuantity: 6,
        lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
        resolvedBranchPriceKgs: 1000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 5,
        approvedQuantity: 0,
        lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
        resolvedBranchPriceKgs: 2000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
      {
        quantity: 3,
        approvedQuantity: 2,
        lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
        resolvedBranchPriceKgs: 5000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      },
    ]);
    assert.equal(afterApproveC, 16000);
  });

  it('computes pending line amount as requested quantity times price', () => {
    assert.equal(
      computeBranchPurchaseHqReviewLineAmountKgs({
        quantity: 10,
        lineStatus: BranchPurchaseRequestLineStatus.PENDING_REVIEW,
        resolvedBranchPriceKgs: 5000,
        branchType: 'FRANCHISE',
        hasPricingPolicyAtReview: true,
      }),
      50000,
    );
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
