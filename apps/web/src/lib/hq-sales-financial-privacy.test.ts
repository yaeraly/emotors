import assert from 'node:assert/strict';
import {
  canViewProcurement,
  canViewPricing,
  canViewProductCost,
  isHqSalesManagerUser,
  shouldHideBranchProfitMetrics,
  shouldHideConfidentialCommercialData,
  shouldHideCustomerProfit,
  shouldHideInventoryValuation,
  shouldHideSaleProfitColumn,
} from './rbac';

const hqSalesManager = { role: 'HQ_SALES_MANAGER', roles: ['HQ_SALES_MANAGER'], branchId: null };
const hqCeo = { role: 'CEO', roles: ['CEO'], branchId: null };
const hqFinance = { role: 'FINANCE_MANAGER', roles: ['FINANCE_MANAGER'], branchId: null };
const supplyManager = {
  role: 'SUPPLY_CHAIN_MANAGER',
  roles: ['SUPPLY_CHAIN_MANAGER'],
  branchId: null,
  permissions: ['procurement.view', 'procurement.manage'],
};

assert.equal(isHqSalesManagerUser(hqSalesManager), true);
assert.equal(canViewProductCost(hqSalesManager), false);
assert.equal(canViewProcurement(hqSalesManager), false);
assert.equal(canViewPricing(hqSalesManager), false);
assert.equal(shouldHideConfidentialCommercialData(hqSalesManager), true);
assert.equal(shouldHideBranchProfitMetrics(hqSalesManager), true);
assert.equal(shouldHideInventoryValuation(hqSalesManager), true);
assert.equal(shouldHideSaleProfitColumn(hqSalesManager), true);
assert.equal(shouldHideCustomerProfit(hqSalesManager), true);

assert.equal(canViewProductCost(hqCeo), true);
assert.equal(canViewPricing(hqCeo), true);

assert.equal(canViewProductCost(hqFinance), true);
assert.equal(canViewPricing(hqFinance), true);

assert.equal(canViewProcurement(supplyManager), true);
assert.equal(canViewProductCost(supplyManager), true);

console.log('hq-sales-financial-privacy.test.ts: all assertions passed');
