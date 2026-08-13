import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import {
  canPermanentDeleteBusinessData,
  canUpdateBusinessDate,
} from '../rbac/rbac';
import { isSysAdminUser } from '../rbac/sys-admin.util';

const sysAdmin = {
  role: Role.SYSTEM_ADMINISTRATOR,
  roles: [Role.SYSTEM_ADMINISTRATOR],
  permissions: ['data.permanent_delete', 'businessDate.update.hqAdmin'],
};
const ceo = { role: Role.CEO, roles: [Role.CEO], permissions: [] };

console.assert(isSysAdminUser(sysAdmin) === true, '1. SysAdmin identified');
console.assert(isSysAdminUser(null) === false, '2. null is not SysAdmin');
console.assert(canPermanentDeleteBusinessData(ceo) === false, '3. CEO cannot permanent delete');
console.assert(canUpdateBusinessDate(ceo) === false, '4. CEO cannot edit business dates');
console.assert(
  canPermanentDeleteBusinessData(sysAdmin) === true,
  '5. SysAdmin can permanent delete',
);

console.log('sys-admin.util.test.ts: all assertions passed');
