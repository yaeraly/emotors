import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';

describe('resolveUnitCostFromInventoryLayer', () => {
  it('derives unit HQ cost as layer total landed cost ÷ quantity', () => {
    const unit = resolveUnitCostFromInventoryLayer({
      quantity: 10,
      totalCostKgs: 50_000,
      unitCostKgs: 50_000, // stale/incorrect stored unit must not win over total÷qty
    });
    assert.equal(unit, 5_000);
  });

  it('supports decimal unit costs', () => {
    const unit = resolveUnitCostFromInventoryLayer({
      quantity: 3,
      totalCostKgs: 1000,
    });
    assert.equal(unit, 333.33);
  });

  it('falls back to unitCostKgs when total is missing', () => {
    const unit = resolveUnitCostFromInventoryLayer({
      quantity: 5,
      unitCostKgs: 1_250.5,
      totalCostKgs: 0,
    });
    assert.equal(unit, 1_250.5);
  });

  it('returns 0 for empty quantity', () => {
    const unit = resolveUnitCostFromInventoryLayer({
      quantity: 0,
      totalCostKgs: 50_000,
      unitCostKgs: 5_000,
    });
    assert.equal(unit, 0);
  });
});
