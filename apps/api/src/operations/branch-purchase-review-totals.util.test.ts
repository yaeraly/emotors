import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import {
  computeBranchPurchaseHqReviewLineAmountKgs,
  resolveBranchPurchaseHqReviewEffectiveQuantity,
  resolveBranchPurchaseReviewedLineAmountKgs,
  resolveBranchPurchaseSavedOrderLineUnitPriceKgs,
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

  it('approved HQ_BRANCH line uses commercial saved price (67870.14 not FIFO 72490.50)', () => {
    assert.equal(
      computeBranchPurchaseHqReviewLineAmountKgs({
        quantity: 2,
        approvedQuantity: 2,
        lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
        resolvedBranchPriceKgs: 33935.07,
        totalAmount: 67870.14,
        approvedLineTotalKgs: 67870.14,
        estimatedLineProductCostKgs: 72490.5,
        branchType: 'HQ_BRANCH',
        hasPricingPolicyAtReview: true,
      }),
      67870.14,
    );
  });

  it('HQ_BRANCH restores commercial unit×qty when persisted payable drifted to FIFO', () => {
    assert.equal(
      computeBranchPurchaseHqReviewLineAmountKgs({
        quantity: 11,
        approvedQuantity: 11,
        lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
        resolvedBranchPriceKgs: 14756.12,
        totalAmount: 162317.33, // stale FIFO payable
        approvedLineTotalKgs: 162317.33,
        estimatedLineProductCostKgs: 162317.33,
        branchType: 'HQ_BRANCH',
        hasPricingPolicyAtReview: true,
      }),
      162317.32, // 11 × 14756.12
    );
  });

  it('saved order-line unit price prefers frozen Цена для филиала snapshot', () => {
    const savedUnit = resolveBranchPurchaseSavedOrderLineUnitPriceKgs({
      quantity: 2,
      totalAmount: 72490.5,
      resolvedBranchPriceKgs: 36245.25,
      estimatedLineProductCostKgs: 72823.21,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(savedUnit, 36245.25);
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
