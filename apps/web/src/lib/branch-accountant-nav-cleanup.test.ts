import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { User } from './types';
import { shouldHideBranchAccountantDuplicateNavTitle } from './unified-nav-page-title';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const branchAccountant = {
  id: 'accountant-1',
  email: 'accountant@test.com',
  fullName: 'Branch Accountant',
  role: 'ACCOUNTANT' as const,
  roles: ['ACCOUNTANT' as const],
  branchId: 'branch-1',
  permissions: ['finance.view', 'finance.manage', 'payments.manage', 'payroll.manage'],
} satisfies User;

describe('branch accountant duplicate headings', () => {
  it('identifies branch accountant for duplicate title guard', () => {
    assert.equal(shouldHideBranchAccountantDuplicateNavTitle(branchAccountant), true);
  });

  it('hides finance breadcrumb/title for branch accountant dashboard', () => {
    const financeLayout = readFileSync(join(root, 'components/finance/FinanceLayout.tsx'), 'utf8');
    assert.match(financeLayout, /isBranchAccountantUser\(user\)/);
    assert.match(financeLayout, /hideFinanceDuplicateNav/);
  });

  it('removes branch accountant section labels from invoices and transfers pages', () => {
    for (const pagePath of [
      'app/branch-accountant/invoices/page.tsx',
      'app/branch-accountant/transfers/page.tsx',
    ]) {
      const source = readFileSync(join(root, pagePath), 'utf8');
      assert.doesNotMatch(source, /branchAccountant\.section/);
    }
  });

  it('hides phase2 platform subtitle for branch accountant payroll/tax pages', () => {
    const phase2Page = readFileSync(join(root, 'components/Phase2DataPage.tsx'), 'utf8');
    assert.match(phase2Page, /shouldHideBranchAccountantDuplicateNavTitle/);
    assert.match(phase2Page, /hidePlatformSubtitle/);
    assert.match(phase2Page, /!hidePlatformSubtitle \?/);
    assert.match(phase2Page, /phase2\.title/);
  });
});

console.log('branch-accountant-nav-cleanup.test.ts passed');
