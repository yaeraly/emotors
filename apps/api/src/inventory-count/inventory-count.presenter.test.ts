import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  sanitizeInventoryCountItemForUser,
  sanitizeInventoryCountSessionForUser,
  sanitizeInventoryCountSummaryForUser,
  shouldStripBranchWarehouseInventoryFinancials,
} from './inventory-count.presenter';

const branchOperator = {
  id: 'user-1',
  role: Role.WAREHOUSE_OPERATOR,
  roles: [Role.WAREHOUSE_OPERATOR],
  branchId: 'branch-1',
};

const franchiseOwner = {
  id: 'user-2',
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-1',
};

const hqManager = {
  id: 'user-3',
  role: Role.WAREHOUSE_MANAGER,
  roles: [Role.WAREHOUSE_MANAGER],
  branchId: null,
};

describe('inventory-count.presenter — warehouse role financial privacy', () => {
  it('strips financials for Branch and HQ Warehouse managers', () => {
    assert.equal(shouldStripBranchWarehouseInventoryFinancials(branchOperator as any), true);
    assert.equal(shouldStripBranchWarehouseInventoryFinancials(hqManager as any), true);
    assert.equal(shouldStripBranchWarehouseInventoryFinancials(franchiseOwner as any), false);
  });

  it('hides aggregate Сумма расхождений from Branch Warehouse Manager', () => {
    const summary = sanitizeInventoryCountSummaryForUser(branchOperator as any, {
      totalProducts: 5,
      countedProducts: 3,
      remainingProducts: 2,
      shortages: 1,
      overages: 1,
      matched: 1,
      totalDifferenceValueKgs: -150.5,
      surplusValueKgs: 200,
      shortageValueKgs: -350.5,
    });
    assert.equal('totalDifferenceValueKgs' in summary, false);
    assert.equal('surplusValueKgs' in summary, false);
    assert.equal('shortageValueKgs' in summary, false);
    assert.equal(summary.shortages, 1);
    assert.equal(summary.overages, 1);
  });

  it('hides monetary summary from HQ Warehouse Manager', () => {
    const summary = sanitizeInventoryCountSummaryForUser(hqManager as any, {
      totalProducts: 5,
      countedProducts: 3,
      remainingProducts: 2,
      shortages: 1,
      overages: 0,
      matched: 2,
      totalDifferenceValueKgs: 150,
      surplusValueKgs: 150,
      shortageValueKgs: 0,
    });
    assert.equal('totalDifferenceValueKgs' in summary, false);
    assert.equal('surplusValueKgs' in summary, false);
    assert.equal('shortageValueKgs' in summary, false);
    assert.equal(summary.shortages, 1);
  });

  it('keeps full monetary summary for Branch CEO', () => {
    const summary = sanitizeInventoryCountSummaryForUser(franchiseOwner as any, {
      totalProducts: 5,
      countedProducts: 3,
      remainingProducts: 2,
      shortages: 1,
      overages: 0,
      matched: 2,
      totalDifferenceValueKgs: 150,
      surplusValueKgs: 150,
      shortageValueKgs: 0,
    });
    assert.equal(summary.totalDifferenceValueKgs, 150);
    assert.equal(summary.surplusValueKgs, 150);
  });

  it('hides per-item unit cost and discrepancy value from warehouse roles', () => {
    const item = sanitizeInventoryCountItemForUser(branchOperator as any, {
      id: 'item-1',
      sku: 'SKU-1',
      systemQuantity: 10,
      actualQuantity: 8,
      differenceQuantity: -2,
      unitCostKgs: 100,
      differenceValueKgs: -200,
    });
    assert.equal('unitCostKgs' in item, false);
    assert.equal('differenceValueKgs' in item, false);
    assert.equal(item.differenceQuantity, -2);
    assert.equal(item.systemQuantity, 10);
  });

  it('session sanitize strips monetary fields for warehouse roles', () => {
    const session = sanitizeInventoryCountSessionForUser(branchOperator as any, {
      id: 'session-1',
      sessionNumber: 'IC-001',
      summary: {
        totalProducts: 2,
        countedProducts: 2,
        remainingProducts: 0,
        shortages: 1,
        overages: 1,
        matched: 0,
        totalDifferenceValueKgs: 50,
        surplusValueKgs: 120,
        shortageValueKgs: -70,
      },
      items: [
        {
          id: 'item-1',
          sku: 'SKU-1',
          unitCostKgs: 10,
          differenceValueKgs: 120,
          differenceQuantity: 1,
        },
        {
          id: 'item-2',
          sku: 'SKU-2',
          unitCostKgs: 20,
          differenceValueKgs: -70,
          differenceQuantity: -1,
        },
      ],
    });
    assert.equal('totalDifferenceValueKgs' in session.summary, false);
    assert.equal('surplusValueKgs' in session.summary, false);
    assert.equal('unitCostKgs' in session.items[0], false);
    assert.equal('differenceValueKgs' in session.items[0], false);
    assert.equal('unitCostKgs' in session.items[1], false);
    assert.equal('differenceValueKgs' in session.items[1], false);
    assert.equal(session.items[0].differenceQuantity, 1);
  });

  it('does not expose zero monetary total to warehouse roles', () => {
    const summary = sanitizeInventoryCountSummaryForUser(hqManager as any, {
      totalProducts: 1,
      countedProducts: 1,
      remainingProducts: 0,
      shortages: 0,
      overages: 0,
      matched: 1,
      totalDifferenceValueKgs: 0,
    });
    assert.equal('totalDifferenceValueKgs' in summary, false);
  });
});
