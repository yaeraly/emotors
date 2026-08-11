import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import { deriveRequestStatusFromLines, resolveLineReview } from './branch-request-review.util';

describe('resolveLineReview booking availability', () => {
  it('allows full approval when general stock is zero but line is booked', () => {
    const result = resolveLineReview(
      { id: 'line-1', action: 'APPROVE' },
      {
        requestedQuantity: 6,
        availableQuantity: 0,
        bookedQuantity: 6,
        hasPricingPolicy: true,
      },
    );

    assert.equal(result.lineStatus, BranchPurchaseRequestLineStatus.APPROVED);
    assert.equal(result.approvedQuantity, 6);
  });

  it('rejects approval above booked plus general availability', () => {
    assert.throws(
      () =>
        resolveLineReview(
          { id: 'line-1', action: 'PARTIAL', approvedQuantity: 8 },
          {
            requestedQuantity: 10,
            availableQuantity: 0,
            bookedQuantity: 6,
            hasPricingPolicy: true,
          },
        ),
      /APPROVED_QUANTITY_EXCEEDS_AVAILABLE/,
    );
  });

  it('supports partial approval when requested exceeds available stock', () => {
    const result = resolveLineReview(
      { id: 'line-1', action: 'PARTIAL', approvedQuantity: 5 },
      {
        requestedQuantity: 10,
        availableQuantity: 5,
        bookedQuantity: 0,
        hasPricingPolicy: true,
      },
    );

    assert.equal(result.lineStatus, BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED);
    assert.equal(result.approvedQuantity, 5);
    assert.equal(result.unavailableQuantity, 5);
    assert.equal(result.notifyCeoOutOfStock, true);
  });

  it('supports partial approval via APPROVE with explicit approved quantity', () => {
    const result = resolveLineReview(
      { id: 'line-1', action: 'APPROVE', approvedQuantity: 6 },
      {
        requestedQuantity: 10,
        availableQuantity: 10,
        bookedQuantity: 0,
        hasPricingPolicy: true,
      },
    );

    assert.equal(result.lineStatus, BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED);
    assert.equal(result.approvedQuantity, 6);
    assert.equal(result.unavailableQuantity, 4);
  });

  it('supports full approval via APPROVE with explicit approved quantity', () => {
    const result = resolveLineReview(
      { id: 'line-1', action: 'APPROVE', approvedQuantity: 10 },
      {
        requestedQuantity: 10,
        availableQuantity: 10,
        bookedQuantity: 0,
        hasPricingPolicy: true,
      },
    );

    assert.equal(result.lineStatus, BranchPurchaseRequestLineStatus.APPROVED);
    assert.equal(result.approvedQuantity, 10);
  });

  it('blocks APPROVE with zero explicit approved quantity', () => {
    assert.throws(
      () =>
        resolveLineReview(
          { id: 'line-1', action: 'APPROVE', approvedQuantity: 0 },
          {
            requestedQuantity: 10,
            availableQuantity: 10,
            hasPricingPolicy: true,
          },
        ),
      /APPROVED_QUANTITY_REQUIRED/,
    );
  });

  it('rejects approval above requested quantity', () => {
    assert.throws(
      () =>
        resolveLineReview(
          { id: 'line-1', action: 'PARTIAL', approvedQuantity: 11 },
          {
            requestedQuantity: 10,
            availableQuantity: 10,
            hasPricingPolicy: true,
          },
        ),
      /APPROVED_QUANTITY_EXCEEDS_REQUESTED/,
    );
  });

  it('blocks approval when pricing policy is missing', () => {
    assert.throws(
      () =>
        resolveLineReview(
          { id: 'line-1', action: 'APPROVE' },
          {
            requestedQuantity: 10,
            availableQuantity: 10,
            hasPricingPolicy: false,
          },
        ),
      /NO_PRICING_POLICY/,
    );
  });

  it('rejects invalid approved quantity', () => {
    assert.throws(
      () =>
        resolveLineReview(
          { id: 'line-1', action: 'PARTIAL', approvedQuantity: Number.NaN },
          {
            requestedQuantity: 10,
            availableQuantity: 10,
            hasPricingPolicy: true,
          },
        ),
      /INVALID_APPROVED_QUANTITY/,
    );
  });

  it('allows approval up to min(requested, HQ available): request 10, available 6, approve 6', () => {
    const result = resolveLineReview(
      { id: 'line-1', action: 'APPROVE', approvedQuantity: 6 },
      {
        requestedQuantity: 10,
        availableQuantity: 6,
        bookedQuantity: 0,
        hasPricingPolicy: true,
      },
    );

    assert.equal(result.lineStatus, BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED);
    assert.equal(result.approvedQuantity, 6);
  });

  it('blocks approval above HQ available: request 10, available 6, approve 7', () => {
    assert.throws(
      () =>
        resolveLineReview(
          { id: 'line-1', action: 'APPROVE', approvedQuantity: 7 },
          {
            requestedQuantity: 10,
            availableQuantity: 6,
            bookedQuantity: 0,
            hasPricingPolicy: true,
          },
        ),
      /APPROVED_QUANTITY_EXCEEDS_AVAILABLE/,
    );
  });

  it('allows approval when request is lower than HQ available: request 5, available 20, approve 5', () => {
    const result = resolveLineReview(
      { id: 'line-1', action: 'APPROVE', approvedQuantity: 5 },
      {
        requestedQuantity: 5,
        availableQuantity: 20,
        bookedQuantity: 0,
        hasPricingPolicy: true,
      },
    );

    assert.equal(result.lineStatus, BranchPurchaseRequestLineStatus.APPROVED);
    assert.equal(result.approvedQuantity, 5);
  });
});

describe('deriveRequestStatusFromLines', () => {
  it('marks request partially approved when a line has shortage', () => {
    const status = deriveRequestStatusFromLines([
      {
        lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
        approvedQuantity: 5,
        unavailableQuantity: 5,
      },
    ]);
    assert.equal(status, 'PARTIALLY_APPROVED');
  });
});
