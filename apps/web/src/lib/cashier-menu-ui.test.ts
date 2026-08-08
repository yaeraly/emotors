import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { User } from './types';
import {
  shouldHideBranchCashierDuplicateNavTitle,
  usesUnifiedNavPageTitle,
} from './unified-nav-page-title';
import { canShowHqCashierAccountTransferMenu } from './finance-account-visibility';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const branchCashier = {
  id: 'cashier-1',
  email: 'cashier@test.com',
  fullName: 'Branch Cashier',
  role: 'CASHIER' as const,
  roles: ['CASHIER' as const],
  branchId: 'branch-1',
  permissions: ['payments.manage', 'cashier', 'sales.manage'],
} satisfies User;

const hqCashier = {
  id: 'hq-cashier-1',
  email: 'hq-cashier@test.com',
  fullName: 'HQ Cashier',
  role: 'HQ_CASHIER' as const,
  roles: ['HQ_CASHIER' as const],
  branchId: null,
  permissions: ['payments.manage', 'cashier'],
} satisfies User;

describe('HQ cashier transfer menu visibility', () => {
  it('requires at least two active usable accounts', () => {
    assert.equal(canShowHqCashierAccountTransferMenu([]), false);
    assert.equal(canShowHqCashierAccountTransferMenu([{ status: 'ACTIVE' }]), false);
    assert.equal(
      canShowHqCashierAccountTransferMenu([{ status: 'ACTIVE' }, { status: 'ACTIVE' }]),
      true,
    );
    assert.equal(
      canShowHqCashierAccountTransferMenu([
        { status: 'ACTIVE' },
        { status: 'ACTIVE' },
        { status: 'ACTIVE' },
      ]),
      true,
    );
    assert.equal(
      canShowHqCashierAccountTransferMenu([
        { status: 'ACTIVE' },
        { status: 'ARCHIVED' },
      ]),
      false,
    );
    assert.equal(
      canShowHqCashierAccountTransferMenu([
        { id: 'acc-1', status: 'ACTIVE' },
        { id: 'acc-1', status: 'ACTIVE' },
      ]),
      false,
    );
  });

  it('renders conditional sidebar link in ProtectedShell', () => {
    const shell = readFileSync(join(root, 'components/ProtectedShell.tsx'), 'utf8');
    const hqSidebar = shell.slice(shell.indexOf('hqCashierView ?'), shell.indexOf(') : hqAccountantView ?'));

    assert.match(shell, /canShowHqCashierAccountTransferMenu/);
    assert.match(shell, /apiFetch<FinanceAccount\[]>\('\/finance\/accounts'\)/);
    assert.match(shell, /const \[hqCashierTransferMenuVisible, setHqCashierTransferMenuVisible\] = useState\(false\)/);
    assert.match(shell, /setHqCashierTransferMenuVisible\(canShowHqCashierAccountTransferMenu\(accounts\)\)/);
    assert.match(hqSidebar, /hqCashierTransferMenuVisible \? \(/);
    assert.match(hqSidebar, /href="\/finance\/transfers"/);
    assert.match(hqSidebar, /branchCashier\.accountTransfers/);
  });
});

describe('HQ cashier sidebar menu cleanup', () => {
  it('removes distribution invoices, cashier transfer queue, and branch balances links', () => {
    const shell = readFileSync(join(root, 'components/ProtectedShell.tsx'), 'utf8');
    const hqSidebar = shell.slice(shell.indexOf('hqCashierView ?'), shell.indexOf(') : hqAccountantView ?'));

    assert.doesNotMatch(hqSidebar, /distribution\.invoices/);
    assert.doesNotMatch(hqSidebar, /finance\.transfersCashierQueue/);
    assert.doesNotMatch(hqSidebar, /distribution\.branchBalances/);
    assert.doesNotMatch(hqSidebar, /href="\/distribution\/invoices"/);
    assert.doesNotMatch(hqSidebar, /href="\/finance\/transfers\?status=PENDING_CASHIER"/);
    assert.doesNotMatch(hqSidebar, /href="\/distribution\/branch-balances"/);
  });

  it('keeps other HQ cashier menu items', () => {
    const shell = readFileSync(join(root, 'components/ProtectedShell.tsx'), 'utf8');
    const hqSidebar = shell.slice(shell.indexOf('hqCashierView ?'), shell.indexOf(') : hqAccountantView ?'));

    assert.match(hqSidebar, /finance\.cashierBills/);
    assert.match(hqSidebar, /finance\.myAccounts/);
    assert.match(hqSidebar, /branchCashier\.accountTransfers/);
    assert.match(hqSidebar, /distribution\.orders/);
  });

  it('keeps removed links available for other roles', () => {
    const shell = readFileSync(join(root, 'components/ProtectedShell.tsx'), 'utf8');
    const afterHqCashier = shell.slice(shell.indexOf(') : hqAccountantView ?'));

    assert.match(afterHqCashier, /distribution\.invoices/);
    assert.match(afterHqCashier, /distribution\.branchBalances/);
  });
});

describe('branch cashier duplicate headings', () => {
  it('hides finance breadcrumb/title for branch cashier accounts page', () => {
    const financeLayout = readFileSync(join(root, 'components/finance/FinanceLayout.tsx'), 'utf8');
    assert.match(financeLayout, /isBranchCashierUser\(user\)/);
    assert.match(financeLayout, /hideFinanceDuplicateNav/);
  });

  it('hides sales subtitle on returns page for branch cashier', () => {
    assert.equal(usesUnifiedNavPageTitle(branchCashier), true);
    assert.equal(usesUnifiedNavPageTitle(hqCashier), false);
  });

  it('hides service subtitle on service cashier page', () => {
    const serviceCashierPage = readFileSync(join(root, 'app/service/cashier/page.tsx'), 'utf8');
    assert.match(serviceCashierPage, /shouldHideBranchCashierDuplicateNavTitle/);
    assert.match(serviceCashierPage, /hideDuplicateTitle \?/);
    assert.equal(shouldHideBranchCashierDuplicateNavTitle(branchCashier), true);
  });

  it('removes branch cashier section labels from cashier pages', () => {
    for (const pagePath of [
      'app/branch-cashier/invoices/page.tsx',
      'app/branch-cashier/installments/page.tsx',
      'app/branch-cashier/transfers/page.tsx',
    ]) {
      const source = readFileSync(join(root, pagePath), 'utf8');
      assert.doesNotMatch(source, /branchCashier\.section/);
    }
  });
});

console.log('cashier-menu-ui.test.ts passed');
