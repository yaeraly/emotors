import type { User } from './types';
import {
  canAccessPath,
  canPermanentDeleteBusinessData,
  isSysAdminUser,
} from './rbac';
import { SYSADMIN_NAV_SECTIONS } from './sysadmin-nav';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const sysAdmin: User = {
  id: 'sysadmin-1',
  email: 'sysadmin@test.com',
  fullName: 'HQ SysAdmin',
  role: 'SYSTEM_ADMINISTRATOR',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['data.permanent_delete', 'businessDate.update.hqAdmin'],
};

const ceo: User = {
  id: 'ceo-1',
  email: 'ceo@test.com',
  fullName: 'CEO',
  role: 'CEO',
  roles: ['CEO'],
  permissions: [],
};

assertEqual(isSysAdminUser(sysAdmin), true, '1. SysAdmin identified');
assertEqual(isSysAdminUser(ceo), false, '2. CEO is not SysAdmin');
assertEqual(canPermanentDeleteBusinessData(sysAdmin), true, '3. SysAdmin can permanent delete');
assertEqual(canPermanentDeleteBusinessData(ceo), false, '4. CEO cannot permanent delete');

for (const section of SYSADMIN_NAV_SECTIONS) {
  for (const link of section.links) {
    assertEqual(
      canAccessPath(sysAdmin, link.href),
      true,
      `5. SysAdmin can access ${link.href}`,
    );
  }
}

const representativeEmployeePanels = [
  '/hq-sales/sales',
  '/hq-accountant/payment-confirmations',
  '/finance/cashier-bills',
  '/branch-ceo/product-directory',
  '/branch-cashier/invoices',
  '/branch-accountant/invoices',
  '/branch-warehouse/warehouse',
  '/service',
  '/procurement',
];

for (const path of representativeEmployeePanels) {
  assertEqual(canAccessPath(sysAdmin, path), true, `6. SysAdmin panel access ${path}`);
}

assertEqual(canAccessPath(ceo, '/sysadmin/test-data-cleanup'), false, '7. CEO cannot access cleanup');

console.log('sysadmin-access.test.ts: all assertions passed');
