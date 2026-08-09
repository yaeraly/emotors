import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import {
  mapBranchPurchaseLineReviewAuditAction,
  resolveBranchPurchaseLineReviewAuditAction,
} from './branch-purchase-line-review.apply';

describe('mapBranchPurchaseLineReviewAuditAction', () => {
  it('maps approved lines to BRANCH_ORDER_ITEM_APPROVED', () => {
    assert.equal(
      mapBranchPurchaseLineReviewAuditAction(BranchPurchaseRequestLineStatus.APPROVED),
      'BRANCH_ORDER_ITEM_APPROVED',
    );
  });

  it('maps partially approved lines to BRANCH_ORDER_ITEM_PARTIALLY_APPROVED', () => {
    assert.equal(
      mapBranchPurchaseLineReviewAuditAction(BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED),
      'BRANCH_ORDER_ITEM_PARTIALLY_APPROVED',
    );
  });

  it('maps rejected lines to BRANCH_ORDER_ITEM_REJECTED', () => {
    assert.equal(
      mapBranchPurchaseLineReviewAuditAction(BranchPurchaseRequestLineStatus.REJECTED),
      'BRANCH_ORDER_ITEM_REJECTED',
    );
  });
});

describe('resolveBranchPurchaseLineReviewAuditAction', () => {
  it('records approval changes when approved quantity is updated', () => {
    assert.equal(
      resolveBranchPurchaseLineReviewAuditAction({
        previousLineStatus: BranchPurchaseRequestLineStatus.APPROVED,
        previousApprovedQuantity: 10,
        nextLineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
        nextApprovedQuantity: 6,
      }),
      'BRANCH_ORDER_ITEM_APPROVAL_CHANGED',
    );
  });

  it('records reapproval after rejection', () => {
    assert.equal(
      resolveBranchPurchaseLineReviewAuditAction({
        previousLineStatus: BranchPurchaseRequestLineStatus.REJECTED,
        previousApprovedQuantity: 0,
        nextLineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
        nextApprovedQuantity: 5,
      }),
      'BRANCH_ORDER_ITEM_REAPPROVED',
    );
  });
});
