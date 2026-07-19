import { Role } from '@prisma/client';
import { toRoleAwareCustomerListItem } from './customer-list.presenter';

const baseCustomer = {
  id: 'customer-1',
  fullName: 'Jane Doe',
  phone: '+996700000000',
  whatsappPhone: '+996700000001',
  status: 'ACTIVE',
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
  it('strips list-only fields for branch sales manager', () => {
    const item = toRoleAwareCustomerListItem(
      { id: 'u1', role: Role.MANAGER, roles: [Role.MANAGER], branchId: 'branch-1' },
      baseCustomer,
    );

    expect(item).not.toHaveProperty('phone');
    expect(item).not.toHaveProperty('branch');
    expect(item).not.toHaveProperty('purchaseCount');
    expect(item.fullName).toBe('Jane Doe');
  });

  it('keeps full list fields for HQ CEO', () => {
    const item = toRoleAwareCustomerListItem(
      { id: 'u2', role: Role.CEO, roles: [Role.CEO], branchId: null },
      baseCustomer,
    );

    expect(item).toHaveProperty('phone', '+996700000000');
    expect(item).toHaveProperty('branch');
    expect(item).toHaveProperty('purchaseCount', 3);
  });
});
