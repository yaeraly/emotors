import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAcceptSalePayment,
  canCancelBranchSale,
  shouldSyncSalePaymentsOnDraftSave,
} from './rbac';
import type { User } from './types';

const branchSalesManager: User = {
  id: 'mgr-1',
  username: 'manager',
  email: 'manager@test.local',
  fullName: 'Branch Sales Manager',
  role: 'MANAGER',
  roles: ['MANAGER'],
  branchId: 'branch-1',
  permissions: ['sales.manage', 'crm.manage', 'inventory.view', 'products.view'],
  status: 'ACTIVE',
};

const branchCashier: User = {
  ...branchSalesManager,
  id: 'cashier-1',
  role: 'CASHIER',
  roles: ['CASHIER'],
  permissions: ['payments.manage', 'cashier'],
};

describe('branch sales payment workflow rbac', () => {
  it('branch sales manager cannot accept sale payments', () => {
    assert.equal(canAcceptSalePayment(branchSalesManager), false);
  });

  it('branch cashier can accept sale payments', () => {
    assert.equal(canAcceptSalePayment(branchCashier), true);
  });

  it('draft save skips payment sync for branch sales manager', () => {
    assert.equal(shouldSyncSalePaymentsOnDraftSave(branchSalesManager, 'FULL_PAYMENT'), false);
  });

  it('draft save skips payment sync for installment drafts', () => {
    assert.equal(shouldSyncSalePaymentsOnDraftSave(branchCashier, 'INSTALLMENT'), false);
  });

  it('branch sales manager can cancel branch sales', () => {
    assert.equal(canCancelBranchSale(branchSalesManager), true);
  });
});
