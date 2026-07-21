import {
  canCancelFinanceTransfer,
  canConfirmFinanceTransfer,
  canCreateOwnerInvestment,
  canManageBranchFinanceAccounts,
  canManageFinanceAccounts,
  canPrepareFinanceTransfer,
  canReturnFinanceTransfer,
  canReverseFinanceTransfer,
  isHqFinanceUser,
  resolveFinanceScopeFilter,
} from './finance-access.util';
import { Role } from '@prisma/client';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const branchAccountant = {
  id: 'acc-1',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage'],
};

const branchCeo = {
  id: 'ceo-1',
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-1',
  permissions: ['finance.view'],
};

const hqFinance = {
  id: 'hq-1',
  role: Role.FINANCE_MANAGER,
  roles: [Role.FINANCE_MANAGER],
  branchId: null,
  permissions: ['finance.view', 'finance.manage'],
};

const hqAccountant = {
  id: 'hq-acc',
  role: Role.HQ_ACCOUNTANT,
  roles: [Role.HQ_ACCOUNTANT],
  branchId: null,
  permissions: ['finance.view', 'finance.manage', 'payments.manage'],
};

const hqCashier = {
  id: 'hq-cash',
  role: Role.HQ_CASHIER,
  roles: [Role.HQ_CASHIER],
  branchId: null,
  permissions: ['payments.manage'],
};

assertEqual(isHqFinanceUser(hqFinance), true, 'hq finance detected');
assertEqual(canManageFinanceAccounts(branchAccountant), true, 'branch accountant manages finance');
assertEqual(canManageBranchFinanceAccounts(branchAccountant), true, 'branch accountant manages branch finance');
assertEqual(canCreateOwnerInvestment(branchCeo), true, 'branch ceo can invest');
assertEqual(
  resolveFinanceScopeFilter(branchAccountant).branchId,
  'branch-1',
  'branch accountant scope is own branch',
);
assertEqual(
  resolveFinanceScopeFilter(hqFinance, 'branch-2').branchId,
  'branch-2',
  'hq can drill into branch',
);

assertEqual(canPrepareFinanceTransfer(hqAccountant), true, 'HQ Accountant prepares transfers');
assertEqual(canPrepareFinanceTransfer(hqCashier), false, 'HQ Cashier cannot prepare transfers');
assertEqual(canConfirmFinanceTransfer(hqCashier), true, 'HQ Cashier confirms transfers');
assertEqual(canConfirmFinanceTransfer(hqAccountant), false, 'HQ Accountant cannot confirm transfers');
assertEqual(canReturnFinanceTransfer(hqCashier), true, 'HQ Cashier can return transfers');
assertEqual(canReturnFinanceTransfer(hqAccountant), false, 'HQ Accountant cannot return as cashier');
assertEqual(canCancelFinanceTransfer(hqAccountant), true, 'HQ Accountant can cancel draft transfers');
assertEqual(canReverseFinanceTransfer(hqFinance), true, 'Finance Manager can reverse');
assertEqual(canReverseFinanceTransfer(hqCashier), false, 'HQ Cashier cannot reverse');

console.log('finance-access.util.test.ts passed');
