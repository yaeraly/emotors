import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldShowInventoryCountDiscrepancyTotal,
  shouldShowInventoryCountItemCostColumns,
} from './inventory-count-discrepancy';

describe('inventory-count discrepancy display (Branch vs HQ)', () => {
  it('Branch Warehouse displays Сумма расхождений total', () => {
    assert.equal(shouldShowInventoryCountDiscrepancyTotal({ hideItemFinancials: true }), true);
    assert.equal(shouldShowInventoryCountDiscrepancyTotal({ hideItemFinancials: false }), true);
  });

  it('uses the same summary card visibility as HQ Warehouse', () => {
    // Aggregate total is always shown; only item-level money columns differ.
    assert.equal(shouldShowInventoryCountDiscrepancyTotal({ hideItemFinancials: true }), true);
    assert.equal(shouldShowInventoryCountItemCostColumns({ hideItemFinancials: true }), false);
    assert.equal(shouldShowInventoryCountItemCostColumns({ hideItemFinancials: false }), true);
  });
});
