import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { toRoleAwareCustomerListItem } from './customer-list.presenter';

const baseCustomer = {
  id: 'customer-1',
  fullName: 'Jane Doe',
  phone: '+996700000000',
  whatsappPhone: '+996700000001',
  status: 'ACTIVE',
  customerType: 'RETAIL',
  branchId: 'branch-1',
  branch: { id: 'branch-1', name: 'Bishkek', code: 'BK' },
  totalPurchases: 1000,
  totalProfit: 200,
  totalDebt: 0,
  purchaseCount: 3,
  lastPurchaseDate: new Date('2026-01-01'),
  createdAt: new Date('2025-12-01'),
  updatedAt: new Date('2026-01-02'),
  totalPurchaseAmount: 1000,
  totalProfitAmount: 200,
  totalDebtAmount: 0,
};

describe('toRoleAwareCustomerListItem', () => {
  it('strips list-only fields for branch sales manager but keeps customerType', () => {
    const item = toRoleAwareCustomerListItem(
      { id: 'u1', role: Role.MANAGER, roles: [Role.MANAGER], branchId: 'branch-1' },
      baseCustomer,
    );

    assert.equal('phone' in item, false);
    assert.equal('branch' in item, false);
    assert.equal('purchaseCount' in item, false);
    assert.equal(item.fullName, 'Jane Doe');
    assert.equal(item.customerType, 'RETAIL');
  });

  it('keeps full list fields for HQ CEO', () => {
    const item = toRoleAwareCustomerListItem(
      { id: 'u2', role: Role.CEO, roles: [Role.CEO], branchId: null },
      baseCustomer,
    );

    assert.equal('phone' in item, true);
    assert.equal('branch' in item, true);
    assert.equal('purchaseCount' in item, true);
    assert.equal(item.customerType, 'RETAIL');
  });
});
