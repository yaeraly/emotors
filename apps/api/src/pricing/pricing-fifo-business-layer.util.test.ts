import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isSeedStockMovementReference,
  SEED_FIFO_REFERENCE_TYPE,
} from './pricing-fifo-business-layer.util';

describe('pricing-fifo-business-layer', () => {
  it('identifies legacy seed repro movements', () => {
    assert.equal(
      isSeedStockMovementReference({ referenceType: SEED_FIFO_REFERENCE_TYPE, referenceId: 'x' }),
      true,
    );
    assert.equal(isSeedStockMovementReference({ referenceType: 'PROCUREMENT_GOODS_RECEIVING', referenceId: 'recv-1' }), true);
    assert.equal(
      isSeedStockMovementReference({
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
        referenceId: 'cuid123',
        note: 'seed-sus001-repro',
      }),
      true,
    );
    assert.equal(
      isSeedStockMovementReference({
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
        referenceId: 'real-receiving-id',
      }),
      false,
    );
  });
});
