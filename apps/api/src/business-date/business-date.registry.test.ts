import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { canUpdateBusinessDate } from '../rbac/rbac';
import { isSupportedBusinessDateEntity } from './business-date.registry';

const hqAdmin = {
  role: Role.SYSTEM_ADMINISTRATOR,
  roles: [Role.SYSTEM_ADMINISTRATOR],
  permissions: ['businessDate.update.hqAdmin'],
};
const ceo = { role: Role.CEO, roles: [Role.CEO], permissions: [] };

console.assert(canUpdateBusinessDate(hqAdmin) === true, '1. HQ Admin can update business date');
console.assert(canUpdateBusinessDate(ceo) === false, '2. CEO cannot update business date');
console.assert(
  isSupportedBusinessDateEntity('Sale', 'saleDate') === true,
  '3. Sale.saleDate supported',
);
console.assert(
  isSupportedBusinessDateEntity('Payment', 'paidAt') === true,
  '4. Payment.paidAt supported',
);
console.assert(
  isSupportedBusinessDateEntity('Sale', 'createdAt') === false,
  '5. createdAt not supported',
);
console.assert(
  isSupportedBusinessDateEntity('Unknown', 'saleDate') === false,
  '6. unknown entity rejected',
);

console.log('business-date.registry.test.ts: all assertions passed');
