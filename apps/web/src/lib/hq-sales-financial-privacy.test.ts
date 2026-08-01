import assert from 'node:assert/strict';
import {
  canViewProductCost,
  isHqSalesManagerUser,
} from './rbac';

const hqSalesManager = { role: 'HQ_SALES_MANAGER', roles: ['HQ_SALES_MANAGER'], branchId: null };
const hqCeo = { role: 'CEO', roles: ['CEO'], branchId: null };
const hqFinance = { role: 'FINANCE_MANAGER', roles: ['FINANCE_MANAGER'], branchId: null };
const hqAccountant = { role: 'HQ_ACCOUNTANT', roles: ['HQ_ACCOUNTANT'], branchId: null };

assert.equal(isHqSalesManagerUser(hqSalesManager), true);
assert.equal(canViewProductCost(hqSalesManager), false, 'HQ Sales Manager cannot view product cost');
assert.equal(canViewProductCost(hqCeo), true, 'HQ CEO can view product cost');
assert.equal(canViewProductCost(hqFinance), true, 'HQ Finance can view product cost');
assert.equal(canViewProductCost(hqAccountant), true, 'HQ Accountant can view product cost');

console.log('hq-sales-financial-privacy.test.ts: all assertions passed');
