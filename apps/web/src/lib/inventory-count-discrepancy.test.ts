import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldHideInventoryCountFinancials,
  shouldShowInventoryCountDiscrepancyTotal,
  shouldShowInventoryCountItemCostColumns,
} from './inventory-count-discrepancy';

const branchWarehouseManager = {
  role: 'WAREHOUSE_OPERATOR' as const,
  roles: ['WAREHOUSE_OPERATOR' as const],
  permissions: [],
  branchId: 'branch-1',
};

const hqWarehouseManager = {
  role: 'WAREHOUSE_MANAGER' as const,
  roles: ['WAREHOUSE_MANAGER' as const],
  permissions: [],
};

const branchCeo = {
  role: 'FRANCHISE_OWNER' as const,
  roles: ['FRANCHISE_OWNER' as const],
  permissions: [],
};

const ceo = {
  role: 'CEO' as const,
  roles: ['CEO' as const],
  permissions: ['*'],
};

describe('inventory-count discrepancy display (warehouse vs financial roles)', () => {
  it('hides monetary summary for HQ and Branch Warehouse managers', () => {
    assert.equal(shouldHideInventoryCountFinancials(branchWarehouseManager), true);
    assert.equal(shouldHideInventoryCountFinancials(hqWarehouseManager), true);
    assert.equal(shouldHideInventoryCountFinancials(branchCeo), false);
    assert.equal(shouldHideInventoryCountFinancials(ceo), false);
  });

  it('Branch Warehouse does not show Сумма расхождений', () => {
    assert.equal(shouldShowInventoryCountDiscrepancyTotal({ hideItemFinancials: true }), false);
    assert.equal(shouldShowInventoryCountItemCostColumns({ hideItemFinancials: true }), false);
  });

  it('HQ Warehouse does not show monetary discrepancy columns', () => {
    assert.equal(shouldShowInventoryCountDiscrepancyTotal({ hideItemFinancials: true }), false);
    assert.equal(shouldShowInventoryCountItemCostColumns({ hideItemFinancials: true }), false);
  });

  it('financial roles keep monetary discrepancy visibility', () => {
    assert.equal(shouldShowInventoryCountDiscrepancyTotal({ hideItemFinancials: false }), true);
    assert.equal(shouldShowInventoryCountItemCostColumns({ hideItemFinancials: false }), true);
  });
});
