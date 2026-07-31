import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertCanHqCeoManageLifecycle, canHqCeoManageLifecycle } from '../lifecycle/hq-ceo-lifecycle.util';
import { BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE, BRANCH_WAREHOUSE_DELETE_SUCCESS_MESSAGE } from '../lifecycle/hq-ceo-lifecycle.constants';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const scm = { role: Role.SUPPLY_CHAIN_MANAGER, roles: [Role.SUPPLY_CHAIN_MANAGER], permissions: [] };
const ceo = { role: Role.CEO, roles: [Role.CEO], permissions: [] };

assert(canHqCeoManageLifecycle(ceo), 'HQ CEO can call delete API');
assert(!canHqCeoManageLifecycle(scm), 'Other roles cannot call delete API');

try {
  assertCanHqCeoManageLifecycle({
    id: 'scm-1',
    email: 'scm@test.com',
    fullName: 'SCM',
    role: Role.SUPPLY_CHAIN_MANAGER,
    roles: [Role.SUPPLY_CHAIN_MANAGER],
    branchId: '',
    permissions: [],
  });
  throw new Error('SCM should be forbidden');
} catch (err) {
  assert(err instanceof ForbiddenException, 'Delete API returns 403 for non-CEO');
}

assert(
  BRANCH_WAREHOUSE_DELETE_BLOCKED_MESSAGE.includes('Складды өчүрүүгө болбойт'),
  'Blocked message is clear in Kyrgyz',
);
assert(
  BRANCH_WAREHOUSE_DELETE_SUCCESS_MESSAGE === 'Филиалдын склады ийгиликтүү өчүрүлдү.',
  'Success message matches spec',
);

console.log('branch-warehouse-delete.rbac.test.ts: all assertions passed');
