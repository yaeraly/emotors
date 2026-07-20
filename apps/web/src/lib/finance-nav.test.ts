import { visibleFinanceNavSections } from './finance-nav';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const salesManagerWithCashier = {
  id: 'sm1',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['cashier', 'payments.manage'],
};

const branchAccountant = {
  id: 'a1',
  role: 'ACCOUNTANT' as const,
  roles: ['ACCOUNTANT' as const],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
};

const cashierNav = visibleFinanceNavSections(salesManagerWithCashier);
assertEqual(cashierNav.some((s) => s.href === '/finance/payments/pending'), true, 'cashier-capable employee sees pending payments');
assertEqual(cashierNav.some((s) => s.href === '/finance/investments'), false, 'cashier hidden from investments');

const accountantNav = visibleFinanceNavSections(branchAccountant);
assertEqual(accountantNav.some((s) => s.href === '/finance/dashboard'), true, 'accountant sees dashboard');
assertEqual(accountantNav.some((s) => s.href === '/finance/reconciliation'), true, 'accountant sees reconciliation');

console.log('finance-nav.test.ts passed');
