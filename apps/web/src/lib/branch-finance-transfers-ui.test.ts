import { readFileSync } from 'fs';
import { join } from 'path';
import type { User } from './types';
import {
  buildTransferStatusHistory,
  formatTransferField,
} from './finance-transfer-detail';
import { usesCompactFinanceTransferTable } from './finance-transfer-table';
import {
  canAccessFinancePath,
  visibleFinanceNavSections,
  visibleFinanceReportLinks,
} from './finance-nav';
import { canAccessPath } from './rbac';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack: string, needle: string, label: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected source to include ${JSON.stringify(needle)}`);
  }
}

function assertExcludes(haystack: string, needle: string, label: string) {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: expected source to exclude ${JSON.stringify(needle)}`);
  }
}

const branchAccountant = {
  id: 'acc-1',
  email: 'accountant@test.com',
  fullName: 'Branch Accountant',
  role: 'ACCOUNTANT' as const,
  roles: ['ACCOUNTANT' as const],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
} satisfies User;

const branchOwner = {
  id: 'ceo-1',
  email: 'ceo@test.com',
  fullName: 'Branch CEO',
  role: 'FRANCHISE_OWNER' as const,
  roles: ['FRANCHISE_OWNER' as const],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage', 'crm.manage', 'sales.manage'],
} satisfies User;

const hqFinance = {
  id: 'hq-1',
  email: 'hq@test.com',
  fullName: 'HQ Finance',
  role: 'FINANCE_MANAGER' as const,
  roles: ['FINANCE_MANAGER' as const],
  branchId: null,
  permissions: ['finance.view', 'finance.manage'],
} satisfies User;

assertEqual(usesCompactFinanceTransferTable(branchAccountant), true, 'branch accountant uses compact table');
assertEqual(usesCompactFinanceTransferTable(branchOwner), true, 'branch ceo uses compact table');
assertEqual(usesCompactFinanceTransferTable(hqFinance), false, 'hq finance keeps full table');

const transfersPage = readFileSync(join(__dirname, '../app/finance/transfers/page.tsx'), 'utf8');
const detailPage = readFileSync(join(__dirname, '../app/finance/transfers/[id]/page.tsx'), 'utf8');
const protectedShell = readFileSync(join(__dirname, '../components/ProtectedShell.tsx'), 'utf8');

assertIncludes(transfersPage, 'compactTable', 'transfers page has compact table mode');
assertIncludes(transfersPage, "t('finance.transferReceipt')", 'full table still has receipt label for hq');
assertIncludes(transfersPage, 'compactTable ?', 'compact table branch exists');
assertExcludes(
  transfersPage.slice(transfersPage.indexOf('compactTable ?'), transfersPage.indexOf(') : (')),
  'finance.transferCashier',
  'compact table block excludes cashier column',
);
assertIncludes(transfersPage, "t('common.open')", 'open action label present');
assertIncludes(transfersPage, '/finance/transfers/${transfer.id}', 'open links to detail route');

assertIncludes(detailPage, 'finance.transferReceipt', 'detail shows receipt');
assertIncludes(detailPage, 'finance.transactionNumber', 'detail shows transaction number');
assertIncludes(detailPage, 'finance.comment', 'detail shows comment');
assertIncludes(detailPage, 'finance.transferCashier', 'detail shows cashier');
assertIncludes(detailPage, 'finance.transferAccountant', 'detail shows accountant');
assertIncludes(detailPage, 'finance.statusHistory', 'detail shows status history');

const accountantNav = visibleFinanceNavSections(branchAccountant);
const ownerNav = visibleFinanceNavSections(branchOwner);
assertEqual(
  accountantNav.some((section) => section.href === '/finance/cash-flow'),
  false,
  'branch accountant finance nav hides cash flow',
);
assertEqual(
  ownerNav.some((section) => section.href === '/finance/cash-flow'),
  false,
  'branch ceo finance nav hides cash flow',
);
assertEqual(
  visibleFinanceReportLinks(branchAccountant).some((link) => link.href === '/finance/cash-flow'),
  false,
  'branch accountant report links hide cash flow',
);

assertEqual(canAccessFinancePath(branchAccountant, '/finance/cash-flow'), false, 'branch accountant cannot access cash flow');
assertEqual(canAccessFinancePath(branchOwner, '/finance/cash-flow'), false, 'branch ceo cannot access cash flow');
assertEqual(canAccessFinancePath(hqFinance, '/finance/cash-flow'), true, 'hq finance can access cash flow');
assertEqual(canAccessFinancePath(branchAccountant, '/finance/transfers/transfer-1'), true, 'branch accountant can open transfer detail');
assertEqual(canAccessPath(branchAccountant, '/finance/cash-flow'), false, 'branch accountant path blocked for cash flow');
assertIncludes(protectedShell, "redirectTo: '/finance/transfers'", 'cash flow redirects to transfers');

const transfer = {
  id: 't1',
  transferNumber: 'FTR-1',
  amount: 100,
  currency: 'KGS',
  transferDate: '2026-01-01T00:00:00.000Z',
  status: 'COMPLETED' as const,
  notes: 'Test comment',
  transactionNumber: 'TX-42',
  createdAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-02T00:00:00.000Z',
  sourceAccount: { id: 'a1', name: 'Cash', accountNumber: '1', scope: 'BRANCH' as const, typeCode: 'CASH', currency: 'KGS', status: 'ACTIVE' as const, openingBalance: 0, currentBalance: 0, availableBalance: 0, pendingBalance: 0 },
  destinationAccount: { id: 'a2', name: 'Bank', accountNumber: '2', scope: 'BRANCH' as const, typeCode: 'BANK', currency: 'KGS', status: 'ACTIVE' as const, openingBalance: 0, currentBalance: 0, availableBalance: 0, pendingBalance: 0 },
  cashier: { id: 'c1', fullName: 'Cashier One' },
  accountant: { id: 'b1', fullName: 'Accountant One' },
  receipts: [{ id: 'r1', fileName: 'receipt.pdf', fileUrl: '/files/receipt.pdf', entityType: 'FINANCE_TRANSFER_RECEIPT' }],
};

const history = buildTransferStatusHistory(transfer);
assertEqual(history.length >= 2, true, 'status history has multiple entries');
assertEqual(formatTransferField(''), '—', 'empty field shows dash');
assertEqual(formatTransferField('TX-42'), 'TX-42', 'field value preserved');

console.log('branch-finance-transfers-ui.test.ts passed');
