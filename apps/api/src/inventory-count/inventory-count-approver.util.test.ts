import assert from 'node:assert/strict';
import { Role, WarehouseType } from '@prisma/client';
import {
  canUserApproveInventoryForWarehouse,
  resolveInventoryApprovalScope,
  resolveInventoryApproverRoles,
} from './inventory-count-approver.util';

const branchWarehouse = { warehouseType: WarehouseType.BRANCH, branchId: 'branch-1' };
const hqWarehouse = { warehouseType: WarehouseType.HQ, branchId: null };

assert.equal(resolveInventoryApprovalScope(branchWarehouse), 'BRANCH');
assert.equal(resolveInventoryApprovalScope(hqWarehouse), 'HQ');

assert.deepEqual(resolveInventoryApproverRoles(branchWarehouse), [Role.FRANCHISE_OWNER]);
assert.deepEqual(resolveInventoryApproverRoles(hqWarehouse), [Role.CEO, Role.OWNER]);

assert.equal(
  canUserApproveInventoryForWarehouse([Role.FRANCHISE_OWNER], 'branch-1', branchWarehouse),
  true,
);
assert.equal(
  canUserApproveInventoryForWarehouse([Role.CEO], null, branchWarehouse),
  false,
);
assert.equal(
  canUserApproveInventoryForWarehouse([Role.FRANCHISE_OWNER], 'branch-2', branchWarehouse),
  false,
);
assert.equal(canUserApproveInventoryForWarehouse([Role.CEO], null, hqWarehouse), true);
assert.equal(
  canUserApproveInventoryForWarehouse([Role.FRANCHISE_OWNER], 'branch-1', hqWarehouse),
  false,
);

console.log('inventory-count-approver.util tests passed');
