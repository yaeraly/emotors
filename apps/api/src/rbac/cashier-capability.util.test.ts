import { Role } from '@prisma/client';
import {
  CASHIER_CAPABILITY_PERMISSION,
  DEFAULT_CASHIER_ASSIGNMENT_OPERATIONS,
  hasCashierCapability,
  isAssignmentCurrentlyActive,
} from './cashier-capability.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const salesManagerWithCashier = {
  id: 'sm-1',
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  permissions: [CASHIER_CAPABILITY_PERMISSION, 'payments.manage'],
};

const dedicatedCashier = {
  id: 'cashier-1',
  role: Role.CASHIER,
  roles: [Role.CASHIER],
  branchId: 'branch-1',
  permissions: ['payments.manage', 'cashier'],
};

const managerWithoutCashier = {
  id: 'mgr-1',
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
};

assertEqual(hasCashierCapability(salesManagerWithCashier), true, 'sales manager with cashier capability');
assertEqual(hasCashierCapability(dedicatedCashier), true, 'dedicated cashier role');
assertEqual(hasCashierCapability(managerWithoutCashier), false, 'manager without cashier capability');
assertEqual(
  isAssignmentCurrentlyActive({ isActive: true, startDate: null, endDate: null }),
  true,
  'active assignment',
);
assertEqual(DEFAULT_CASHIER_ASSIGNMENT_OPERATIONS.includes('RECEIVE_PAYMENTS'), true, 'default operations');

console.log('cashier-capability.util.test.ts passed');
