import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBusinessProcurementReceiptReference, isSeedStockMovementReference } from './pricing-fifo-business-layer.util';
import { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';

describe('hq-fifo-audit helpers', () => {
  it('derives per-receipt unit landed cost from allocated total and received quantity', () => {
    const unit = resolveUnitCostFromInventoryLayer({
      quantity: 15,
      totalCostKgs: 24944.55,
    });
    assert.equal(unit, 1662.97);
  });

  it('identifies business procurement receipt references', () => {
    assert.equal(isBusinessProcurementReceiptReference('PROCUREMENT_GOODS_RECEIVING'), true);
    assert.equal(isBusinessProcurementReceiptReference('SEED_REPRO'), false);
  });

  it('excludes legacy seed inventory from business FIFO layers', () => {
    assert.equal(
      isSeedStockMovementReference({ referenceType: 'SEED_REPRO', referenceId: 'any' }),
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
