import type { User } from './types';
import {
  FINANCE_PAYMENT_TABS,
  FINANCE_SHIFT_TABS,
  canAccessFinancePath,
  isCashierOnlyFinanceUser,
  visibleFinanceNavSections,
} from './finance-nav';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const branchCashier = {
  id: 'cashier-1',
  email: 'cashier@test.com',
  fullName: 'Branch Cashier',
  role: 'CASHIER' as const,
  roles: ['CASHIER' as const],
  branchId: 'branch-1',
  permissions: ['payments.manage', 'cashier', 'sales.manage'],
} satisfies User;

const salesManagerWithCashier = {
  id: 'sm1',
  email: 'sm@test.com',
  fullName: 'Sales Manager',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['cashier', 'payments.manage'],
} satisfies User;

const branchAccountant = {
  id: 'a1',
  email: 'accountant@test.com',
  fullName: 'Branch Accountant',
  role: 'ACCOUNTANT' as const,
  roles: ['ACCOUNTANT' as const],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
} satisfies User;

assertEqual(isCashierOnlyFinanceUser(branchCashier), true, 'branch cashier is cashier-only finance user');
assertEqual(isCashierOnlyFinanceUser(branchAccountant), false, 'accountant is not cashier-only');

const cashierNav = visibleFinanceNavSections(branchCashier);
assertEqual(cashierNav.length, 0, 'cashier-only user has no duplicated finance main nav');

const cashierNavFromManager = visibleFinanceNavSections(salesManagerWithCashier);
assertEqual(cashierNavFromManager.length, 0, 'cashier-capable manager without finance.manage has no main nav');

const accountantNav = visibleFinanceNavSections(branchAccountant);
assertEqual(accountantNav.some((s) => s.href === '/finance/dashboard'), true, 'accountant sees dashboard');
assertEqual(accountantNav.some((s) => s.href === '/finance/reconciliation'), true, 'accountant sees reconciliation');

assertEqual(FINANCE_PAYMENT_TABS.length, 3, 'payment tabs exclude paid');
assertEqual(
  FINANCE_PAYMENT_TABS.some((tab) => tab.href.includes('PAID')),
  false,
  'no paid payment tab',
);

assertEqual(FINANCE_SHIFT_TABS.length, 3, 'shift tabs exclude my shifts');
assertEqual(
  FINANCE_SHIFT_TABS.some((tab) => tab.href.includes('mine=1')),
  false,
  'no my shifts tab',
);

assertEqual(canAccessFinancePath(branchCashier, '/finance/payments/pending'), true, 'cashier can access pending payments');
assertEqual(canAccessFinancePath(branchCashier, '/finance/dashboard'), false, 'cashier cannot access dashboard');
assertEqual(canAccessFinancePath(branchAccountant, '/finance/dashboard'), true, 'accountant can access dashboard');

console.log('finance-nav.test.ts passed');
