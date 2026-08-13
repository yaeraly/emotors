import { shouldStripSaleFinancialFields, isBranchCashierUser } from './rbac';
import { Role } from '@prisma/client';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const branchCashier = {
  id: 'u1',
  role: Role.CASHIER,
  roles: [Role.CASHIER],
  branchId: 'branch-1',
  email: 'cashier@test.com',
  fullName: 'Cashier',
};

const branchSalesManager = {
  id: 'u2',
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  email: 'bsm@test.com',
  fullName: 'BSM',
};

assertEqual(isBranchCashierUser(branchCashier), true, 'cashier detected');
assertEqual(
  shouldStripSaleFinancialFields(branchCashier),
  true,
  'cashier sale financial fields stripped',
);
assertEqual(
  shouldStripSaleFinancialFields(branchSalesManager),
  false,
  'branch sales manager keeps sale financial fields in API',
);

console.log('rbac.cashier.test.ts passed');
