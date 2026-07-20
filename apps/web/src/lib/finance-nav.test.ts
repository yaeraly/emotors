import { visibleFinanceNavSections } from './finance-nav';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const branchCashier = {
  id: 'c1',
  role: 'CASHIER' as const,
  roles: ['CASHIER' as const],
  branchId: 'branch-1',
  permissions: ['payments.manage'],
};

const branchAccountant = {
  id: 'a1',
  role: 'ACCOUNTANT' as const,
  roles: ['ACCOUNTANT' as const],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
};

const cashierNav = visibleFinanceNavSections(branchCashier);
assertEqual(cashierNav.some((s) => s.href === '/finance/payments/pending'), true, 'cashier sees pending payments');
assertEqual(cashierNav.some((s) => s.href === '/finance/investments'), false, 'cashier hidden from investments');

const accountantNav = visibleFinanceNavSections(branchAccountant);
assertEqual(accountantNav.some((s) => s.href === '/finance/dashboard'), true, 'accountant sees dashboard');
assertEqual(accountantNav.some((s) => s.href === '/finance/reconciliation'), true, 'accountant sees reconciliation');

console.log('finance-nav.test.ts passed');
