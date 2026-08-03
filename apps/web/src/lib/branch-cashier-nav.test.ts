import { readFileSync } from 'fs';
import { join } from 'path';
import type { User } from './types';
import { canAccessPath } from './rbac';

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

const shell = readFileSync(join(__dirname, '../components/ProtectedShell.tsx'), 'utf8');
const cashierSidebar = shell.slice(shell.indexOf('branchCashierView ?'), shell.indexOf(') : branchMasterView ?'));

assertEqual(cashierSidebar.includes("t('finance.payments')"), false, 'branch cashier sidebar has no Платежи label');
assertEqual(cashierSidebar.includes('/finance/payments'), false, 'branch cashier sidebar has no payments route');
assertEqual(cashierSidebar.includes("t('branchCashier.invoicesToPay')"), true, 'branch cashier sidebar keeps invoices');
assertEqual(cashierSidebar.includes("t('branchCashier.installments')"), true, 'branch cashier sidebar keeps installments');
assertEqual(cashierSidebar.includes("t('finance.myAccounts')"), true, 'branch cashier sidebar keeps accounts');
assertEqual(cashierSidebar.includes("t('branchCashier.accountTransfers')"), true, 'branch cashier sidebar keeps transfers');
assertEqual(cashierSidebar.includes('sidebarPaymentsNavClass'), false, 'branch cashier sidebar has no payments nav class');
assertEqual(cashierSidebar.includes("t('finance.myShifts')"), false, 'branch cashier sidebar has no Мои смены label');
assertEqual(cashierSidebar.includes('/finance/shifts'), false, 'branch cashier sidebar has no shifts route');
assertEqual(cashierSidebar.includes('sidebarShiftsNavClass'), false, 'branch cashier sidebar has no shifts nav class');

assertEqual(canAccessPath(branchCashier, '/finance/payments/pending'), false, 'branch cashier cannot open pending payments');
assertEqual(canAccessPath(branchCashier, '/finance/payments'), false, 'branch cashier cannot open payments list');
assertEqual(canAccessPath(branchCashier, '/finance/accounts'), true, 'branch cashier can open accounts');
assertEqual(canAccessPath(branchCashier, '/finance/shifts'), false, 'branch cashier cannot open shifts');
assertEqual(canAccessPath(branchCashier, '/branch-cashier/invoices'), true, 'branch cashier can open invoices');
assertEqual(canAccessPath(branchCashier, '/branch-cashier/installments'), true, 'branch cashier can open installments');
assertEqual(canAccessPath(branchCashier, '/branch-cashier/transfers'), true, 'branch cashier can open transfers');

console.log('branch-cashier-nav.test.ts passed');
