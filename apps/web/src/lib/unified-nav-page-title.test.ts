import { readFileSync } from 'fs';
import { join } from 'path';
import type { User } from './types';
import { usesUnifiedNavPageTitle } from './unified-nav-page-title';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const branchSalesManager = {
  id: 'bsm-1',
  email: 'bsm@test.com',
  fullName: 'Branch Sales Manager',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['sales.manage', 'crm.manage', 'inventory.view'],
} satisfies User;

const hqManager = {
  id: 'hq-1',
  email: 'hq@test.com',
  fullName: 'HQ Manager',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: null,
  permissions: ['sales.manage'],
} satisfies User;

assertEqual(usesUnifiedNavPageTitle(branchSalesManager), true, 'branch sales manager uses unified nav titles');
assertEqual(usesUnifiedNavPageTitle(hqManager), false, 'hq manager keeps in-page titles');

const branchCashier = {
  id: 'cashier-1',
  email: 'cashier@test.com',
  fullName: 'Branch Cashier',
  role: 'CASHIER' as const,
  roles: ['CASHIER' as const],
  branchId: 'branch-1',
  permissions: ['payments.manage', 'cashier', 'sales.manage'],
} satisfies User;

assertEqual(usesUnifiedNavPageTitle(branchCashier), true, 'branch cashier hides duplicate page titles');

const returnsPage = readFileSync(join(__dirname, '../app/returns/page.tsx'), 'utf8');
const customersPage = readFileSync(join(__dirname, '../app/customers/page.tsx'), 'utf8');
const branchProductOrdersSection = readFileSync(join(__dirname, '../components/BranchProductOrdersSection.tsx'), 'utf8');

assertEqual(returnsPage.includes('usesUnifiedNavPageTitle'), true, 'returns page guards duplicate title');
assertEqual(returnsPage.includes('showPageTitle'), true, 'returns page uses conditional title');
assertEqual(customersPage.includes('usesUnifiedNavPageTitle'), true, 'customers page guards duplicate title');
assertEqual(branchProductOrdersSection.includes('const showPageHeader = Boolean(title)'), true, 'product orders section hides list titles');

console.log('unified-nav-page-title.test.ts passed');
