import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('branch cashier accounts list', () => {
  const source = readFileSync(join(root, 'app/finance/accounts/page.tsx'), 'utf8');

  it('hides the employee column for branch cashier view', () => {
    assert.match(source, /branchCashierView/);
    assert.match(source, /branchCashierView \? null : \(/);
    assert.match(source, /finance\.assignedEmployee/);
  });
});

describe('branch cashier account detail', () => {
  const source = readFileSync(join(root, 'app/finance/accounts/[id]/page.tsx'), 'utf8');
  const cashierBlock = source.slice(source.indexOf('isBranchCashier ?'), source.indexOf(') : (') + 5);

  it('renders a simple detail page without tabs for branch cashier', () => {
    assert.match(source, /isBranchCashierUser/);
    assert.match(cashierBlock, /finance\.accountName/);
    assert.match(cashierBlock, /finance\.accountType/);
    assert.match(cashierBlock, /finance\.currency/);
    assert.match(cashierBlock, /finance\.balance/);
    assert.match(cashierBlock, /branches\.name/);
    assert.doesNotMatch(cashierBlock, /ModuleSectionNav/);
    assert.doesNotMatch(cashierBlock, /finance\.tabOverview/);
    assert.doesNotMatch(cashierBlock, /finance\.tabTransactions/);
    assert.doesNotMatch(cashierBlock, /finance\.tabAssignments/);
    assert.doesNotMatch(cashierBlock, /AccountAssignmentsPanel/);
    assert.doesNotMatch(cashierBlock, /ledgerEntries/);
  });

  it('keeps tabs for other roles', () => {
    assert.match(source, /ModuleSectionNav sections=\{tabs\}/);
    assert.match(source, /finance\.tabOverview/);
  });
});

describe('branch cashier transfer form', () => {
  const source = readFileSync(join(root, 'app/branch-cashier/transfers/page.tsx'), 'utf8');

  it('uses clean account labels and filters destination options', () => {
    assert.match(source, /formatBranchCashierAccountLabel/);
    assert.match(source, /destinationAccounts/);
    assert.match(source, /filterBranchCashierTransferDestinationAccounts/);
    assert.match(source, /resolveBranchCashierTransferDestinationId/);
    assert.match(source, /updateSourceAccountId/);
    assert.doesNotMatch(source, /account\.accountNumber\)/);
    assert.doesNotMatch(source, /formatKgs\(account\.currentBalance\)/);
  });
});
