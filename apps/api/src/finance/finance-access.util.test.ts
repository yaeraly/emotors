import {
  canApproveFinanceAccountLifecycle,
  canCancelFinanceTransfer,
  canConfirmFinanceTransfer,
  canCreateOwnerInvestment,
  canManageBranchFinanceAccounts,
  canManageFinanceAccounts,
  canManageFinanceInvestments,
  canOperateHqFinanceAccounts,
  canPrepareFinanceTransfer,
  canReturnFinanceTransfer,
  canReverseFinanceTransfer,
  isHqFinanceUser,
  resolveFinanceScopeFilter,
  assertBranchTransferIsolation,
} from './finance-access.util';
import { FinanceAccountScope, Role } from '@prisma/client';

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

const hqCeo = {
  id: 'hq-ceo',
  role: Role.CEO,
  roles: [Role.CEO],
  branchId: null,
  permissions: ['finance.view', 'finance.manage'],
};

const hqOwner = {
  id: 'hq-owner',
  role: Role.OWNER,
  roles: [Role.OWNER],
  branchId: null,
  permissions: ['finance.view', 'finance.manage'],
};

// 1 / 2 / 3 / 4 — CEO can manage; unauthorized roles cannot
assertEqual(canManageFinanceInvestments(hqCeo), true, 'CEO can edit/delete investments');
assertEqual(canManageFinanceInvestments(hqOwner), true, 'Owner can edit/delete investments');
assertEqual(canManageFinanceInvestments(branchCeo), true, 'franchise owner can manage investments');
assertEqual(
  canManageFinanceInvestments(branchAccountant),
  false,
  'branch accountant cannot edit/delete investments',
);
assertEqual(
  canManageFinanceInvestments(hqCashier),
  false,
  'HQ cashier cannot edit/delete investments',
);

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
assertEqual(
  resolveFinanceScopeFilter(hqAccountant).scope,
  'HQ',
  'HQ accountant lists only HQ accounts',
);
assertEqual(
  resolveFinanceScopeFilter(hqAccountant).branchId,
  null,
  'HQ accountant branchId is null',
);
assertEqual(
  canManageBranchFinanceAccounts(branchCeo),
  true,
  'Branch CEO can manage own branch accounts',
);
assertEqual(
  canManageFinanceAccounts(branchCeo),
  true,
  'Branch CEO can create/edit branch accounts',
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

assertEqual(canOperateHqFinanceAccounts(hqAccountant), true, 'HQ Accountant operates HQ accounts');
assertEqual(canOperateHqFinanceAccounts(hqFinance), true, 'Finance Manager operates HQ accounts');
assertEqual(canOperateHqFinanceAccounts(hqCashier), false, 'HQ Cashier cannot operate HQ accounts');
assertEqual(canOperateHqFinanceAccounts(branchAccountant), false, 'Branch accountant cannot operate HQ accounts');
assertEqual(canApproveFinanceAccountLifecycle(hqCeo), true, 'CEO approves archive lifecycle');
assertEqual(canApproveFinanceAccountLifecycle(hqOwner), true, 'Owner approves archive lifecycle');
assertEqual(canApproveFinanceAccountLifecycle(hqAccountant), false, 'HQ Accountant cannot approve archive');
assertEqual(canApproveFinanceAccountLifecycle(hqCashier), false, 'HQ Cashier cannot approve archive');

const branchTransfer = {
  branchId: 'branch-1',
  sourceAccount: { id: 'a1', branchId: 'branch-1', scope: FinanceAccountScope.BRANCH },
  destinationAccount: { id: 'a2', branchId: 'branch-1', scope: FinanceAccountScope.BRANCH },
};
const otherBranchTransfer = {
  branchId: 'branch-2',
  sourceAccount: { id: 'a3', branchId: 'branch-2', scope: FinanceAccountScope.BRANCH },
  destinationAccount: { id: 'a4', branchId: 'branch-2', scope: FinanceAccountScope.BRANCH },
};

try {
  assertBranchTransferIsolation(branchAccountant as never, branchTransfer);
} catch {
  throw new Error('branch accountant should access own branch transfer');
}

let blockedOtherBranch = false;
try {
  assertBranchTransferIsolation(branchAccountant as never, otherBranchTransfer);
} catch (error) {
  blockedOtherBranch =
    error instanceof Error && error.message.includes('Branch isolation violation');
}
assertEqual(blockedOtherBranch, true, 'branch accountant cannot access other branch transfer');

console.log('finance-access.util.test.ts passed');
