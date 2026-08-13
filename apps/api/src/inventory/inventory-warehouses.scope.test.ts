import assert from 'node:assert/strict';
import { WarehouseType } from '@prisma/client';
import { activeBranchWarehouseWhere } from '../warehouse/warehouse.util';

function buildBranchOperatorWarehouseWhere(branchId: string) {
  return {
    ...activeBranchWarehouseWhere,
    branchId,
  };
}

const branchA = 'branch-a';
const branchB = 'branch-b';

const where = buildBranchOperatorWarehouseWhere(branchA);
assert.equal(where.warehouseType, WarehouseType.BRANCH);
assert.equal(where.branchId, branchA);
assert.notEqual(where.branchId, branchB);
assert.equal(where.isActive, true);
assert.equal(where.deletedAt, null);

console.log('inventory-warehouses.scope tests passed');
