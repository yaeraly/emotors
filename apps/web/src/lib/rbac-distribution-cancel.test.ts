import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canCancelBranchDistributionOrder,
  canDispatchFromHq,
  canManageDistributionOrders,
  isHqWarehouseLogisticsOnlyUser,
} from './rbac';
import type { User } from './types';

function user(role: User['role']): User {
  return {
    id: `${role}-1`,
    email: `${role}@example.com`,
    fullName: role,
    role,
    roles: [role],
    permissions: [],
    branchId: null,
    status: 'ACTIVE',
  } as User;
}

describe('web rbac distribution cancel', () => {
  it('HQ Warehouse Manager cannot cancel and cancel UI gate is false', () => {
    const wm = user('WAREHOUSE_MANAGER');
    assert.equal(canCancelBranchDistributionOrder(wm), false);
    assert.equal(canManageDistributionOrders(wm), false);
    assert.equal(canDispatchFromHq(wm), true);
    assert.equal(isHqWarehouseLogisticsOnlyUser(wm), true);
  });

  it('HQ Sales and HQ CEO retain cancellation access', () => {
    assert.equal(canCancelBranchDistributionOrder(user('HQ_SALES_MANAGER')), true);
    assert.equal(canCancelBranchDistributionOrder(user('CEO')), true);
  });
});
