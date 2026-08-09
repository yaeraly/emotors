import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import {
  assertBranchPurchaseLineReviewEditable,
  canEditBranchPurchaseLineReview,
} from './branch-purchase-line-review-editable.util';

describe('branch purchase line review editability', () => {
  it('allows edits while HQ Sales is reviewing submitted orders', () => {
    assert.equal(
      canEditBranchPurchaseLineReview({
        status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
        convertedOrderId: null,
      }),
      true,
    );
    assert.doesNotThrow(() =>
      assertBranchPurchaseLineReviewEditable({
        status: BranchPurchaseRequestStatus.SUBMITTED,
        convertedOrderId: null,
      }),
    );
  });

  it('blocks edits after downstream processing becomes irreversible', () => {
    for (const status of [
      BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
      BranchPurchaseRequestStatus.PAYMENT_CONFIRMED,
      BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
      BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE,
      BranchPurchaseRequestStatus.SHIPPED,
      BranchPurchaseRequestStatus.COMPLETED,
    ]) {
      assert.equal(
        canEditBranchPurchaseLineReview({ status, convertedOrderId: null }),
        false,
        status,
      );
    }
  });

  it('blocks edits when a distribution order is already linked', () => {
    assert.equal(
      canEditBranchPurchaseLineReview({
        status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
        convertedOrderId: 'order-1',
      }),
      false,
    );
    assert.throws(
      () =>
        assertBranchPurchaseLineReviewEditable({
          status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
          convertedOrderId: 'order-1',
        }),
      /BRANCH_ORDER_LINE_REVIEW_LOCKED_DOWNSTREAM/,
    );
  });
});
