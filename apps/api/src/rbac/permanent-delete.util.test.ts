import { Role } from '@prisma/client';
import {
  canPermanentDeleteBusinessData,
  isHqAdminUser,
} from './rbac';

const hqAdmin = { role: Role.SYSTEM_ADMINISTRATOR, roles: [Role.SYSTEM_ADMINISTRATOR] };
const ceo = { role: Role.CEO, roles: [Role.CEO] };
const scm = { role: Role.SUPPLY_CHAIN_MANAGER, roles: [Role.SUPPLY_CHAIN_MANAGER] };

console.assert(isHqAdminUser(hqAdmin) === true, '1. system administrator is HQ Admin');
console.assert(isHqAdminUser(ceo) === false, '2. CEO is not HQ Admin for permanent delete');
console.assert(canPermanentDeleteBusinessData(hqAdmin) === true, '3. HQ Admin can permanent delete');
console.assert(canPermanentDeleteBusinessData(ceo) === false, '4. CEO cannot permanent delete');
console.assert(canPermanentDeleteBusinessData(scm) === false, '5. SCM cannot permanent delete');
console.assert(
  canPermanentDeleteBusinessData({
    role: Role.SYSTEM_ADMINISTRATOR,
    roles: [Role.SYSTEM_ADMINISTRATOR],
    permissions: ['data.permanent_delete'],
  }) === true,
  '6. permission code grants delete',
);

console.log('permanent-delete.util.test.ts passed');
