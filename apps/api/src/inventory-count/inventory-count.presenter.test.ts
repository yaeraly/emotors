import assert from 'node:assert/strict';
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

assert.equal(shouldStripBranchWarehouseInventoryFinancials(branchOperator as any), true);
assert.equal(shouldStripBranchWarehouseInventoryFinancials(franchiseOwner as any), false);

const summary = sanitizeInventoryCountSummaryForUser(branchOperator as any, {
  totalProducts: 5,
  countedProducts: 3,
  remainingProducts: 2,
  shortages: 1,
  overages: 0,
  matched: 2,
  totalDifferenceValueKgs: 150,
});
assert.equal('totalDifferenceValueKgs' in summary, false);
assert.equal(summary.shortages, 1);

const item = sanitizeInventoryCountItemForUser(branchOperator as any, {
  id: 'item-1',
  sku: 'SKU-1',
  systemQuantity: 10,
  unitCostKgs: 100,
  differenceValueKgs: 50,
});
assert.equal('unitCostKgs' in item, false);
assert.equal('differenceValueKgs' in item, false);

const session = sanitizeInventoryCountSessionForUser(branchOperator as any, {
  id: 'session-1',
  sessionNumber: 'IC-001',
  summary: {
    totalProducts: 1,
    countedProducts: 1,
    remainingProducts: 0,
    shortages: 0,
    overages: 0,
    matched: 1,
    totalDifferenceValueKgs: 0,
  },
  items: [
    {
      id: 'item-1',
      sku: 'SKU-1',
      unitCostKgs: 10,
      differenceValueKgs: 0,
    },
  ],
});
assert.equal('totalDifferenceValueKgs' in session.summary, false);
assert.equal('unitCostKgs' in session.items[0], false);

console.log('inventory-count.presenter tests passed');
