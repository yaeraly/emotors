import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  canCancelBranchDistributionOrder,
  canDispatchFromHq,
  canManageDistributionOrders,
  isHqWarehouseLogisticsOnlyUser,
} from './rbac';

const warehouseManager = { role: Role.WAREHOUSE_MANAGER, roles: [Role.WAREHOUSE_MANAGER], permissions: [] };
const hqSales = { role: Role.HQ_SALES_MANAGER, roles: [Role.HQ_SALES_MANAGER], permissions: [] };
const ceo = { role: Role.CEO, roles: [Role.CEO], permissions: [] };

describe('branch-distribution-cancel rbac', () => {
  it('HQ Warehouse Manager cannot cancel branch distribution orders', () => {
    assert.equal(canCancelBranchDistributionOrder(warehouseManager), false);
    assert.equal(canManageDistributionOrders(warehouseManager), false);
    assert.equal(canDispatchFromHq(warehouseManager), true);
    assert.equal(isHqWarehouseLogisticsOnlyUser(warehouseManager), true);
  });

  it('HQ Sales and HQ CEO retain cancellation access', () => {
    assert.equal(canCancelBranchDistributionOrder(hqSales), true);
    assert.equal(canCancelBranchDistributionOrder(ceo), true);
  });

  it('warehouse dispatch permission does not imply cancel permission', () => {
    assert.equal(canDispatchFromHq(warehouseManager), true);
    assert.equal(canCancelBranchDistributionOrder(warehouseManager), false);
  });
});
