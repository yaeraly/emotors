import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBranchReceivingDiscrepancyPayload,
  normalizeBranchReceivingDraftInput,
  validateBranchReceivingQuantities,
} from './branch-receiving-draft.util';
import { buildReceivingProgress } from './receiving-draft.util';

describe('branch receiving draft utils', () => {
  it('rejects negative quantities', () => {
    assert.throws(
      () => validateBranchReceivingQuantities(10, -1, 0, 0),
      /Quantity cannot be negative/,
    );
  });

  it('rejects accepted quantity above shipped quantity', () => {
    assert.throws(
      () => validateBranchReceivingQuantities(10, 11, 0, 0),
      /Accepted quantity exceeds shipped quantity/,
    );
  });

  it('rejects total reported quantity above shipped quantity', () => {
    assert.throws(
      () => validateBranchReceivingQuantities(10, 8, 2, 1),
      /Total reported quantity exceeds shipped quantity/,
    );
  });

  it('normalizes missing quantity when omitted', () => {
    const normalized = normalizeBranchReceivingDraftInput(
      { acceptedQuantity: 8, damagedQuantity: 1 },
      10,
    );
    assert.equal(normalized.missingQuantity, 1);
  });

  it('builds discrepancy payload for partial receipt', () => {
    const payload = buildBranchReceivingDiscrepancyPayload(
      { id: 'line-1', productId: 'prod-1' },
      { id: 'order-1', branchId: 'branch-1' },
      10,
      8,
      0,
      2,
      'short',
    );
    assert.deepEqual(payload, {
      distributionOrderId: 'order-1',
      distributionOrderItemId: 'line-1',
      productId: 'prod-1',
      branchId: 'branch-1',
      expectedQuantity: 10,
      receivedQuantity: 8,
      differenceQuantity: 2,
      type: 'SHORTAGE',
      note: 'short',
    });
  });

  it('calculates progress from saved draft rows only', () => {
    const progress = buildReceivingProgress(
      [
        { id: 'a', expectedQuantity: 5 },
        { id: 'b', expectedQuantity: 3 },
      ],
      [
        {
          itemId: 'a',
          acceptedQuantity: 5,
          damagedQuantity: 0,
          missingQuantity: 0,
          isSaved: true,
        },
      ],
    );
    assert.equal(progress.checked, 1);
    assert.equal(progress.remaining, 1);
    assert.equal(progress.progress, 50);
  });
});
