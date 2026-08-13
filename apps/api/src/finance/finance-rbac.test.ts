import { isBranchCashierUser, isBranchAccountantUser } from '../rbac/rbac';
import { Role } from '@prisma/client';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const cashier = {
  id: 'cashier-1',
  role: Role.CASHIER,
  roles: [Role.CASHIER],
  branchId: 'branch-1',
};

const accountant = {
  id: 'accountant-1',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId: 'branch-1',
};

assertEqual(isBranchCashierUser(cashier), true, 'cashier role');
assertEqual(isBranchAccountantUser(accountant), true, 'accountant role');
assertEqual(isBranchCashierUser(accountant), false, 'accountant is not cashier');

console.log('finance-rbac.test.ts passed');
