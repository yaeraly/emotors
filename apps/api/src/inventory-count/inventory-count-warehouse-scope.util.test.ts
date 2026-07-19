import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { resolveInventoryCountWarehouseScope } from './inventory-count-warehouse-scope.util';

const branchOperator = {
  role: Role.WAREHOUSE_OPERATOR,
  roles: [Role.WAREHOUSE_OPERATOR],
  branchId: 'branch-1',
};

const branchCeo = {
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-1',
};

const hqManager = {
  role: Role.WAREHOUSE_MANAGER,
  roles: [Role.WAREHOUSE_MANAGER],
  branchId: null,
};

const noneScope = { id: '__none__' } as const;
const hqAssignmentScope = { warehouseType: 'HQ' as const, branchId: null };

const operatorScope = resolveInventoryCountWarehouseScope(branchOperator, noneScope);
assert.equal(operatorScope?.branchId, 'branch-1');
assert.equal(operatorScope?.warehouseType, 'BRANCH');
assert.notEqual((operatorScope as { id?: string }).id, '__none__');

const ceoScope = resolveInventoryCountWarehouseScope(branchCeo, noneScope);
assert.equal(ceoScope?.branchId, 'branch-1');
assert.notEqual((ceoScope as { id?: string }).id, '__none__');

const managerScope = resolveInventoryCountWarehouseScope(hqManager, hqAssignmentScope);
assert.deepEqual(managerScope, hqAssignmentScope);

const managerWithoutAssignment = resolveInventoryCountWarehouseScope(hqManager, noneScope);
assert.deepEqual(managerWithoutAssignment, noneScope);

console.log('inventory-count-warehouse-scope.util.test.ts passed');
