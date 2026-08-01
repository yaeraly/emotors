import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FinanceAccountScope, Role } from '@prisma/client';
import {
  assertValidFinanceAccountName,
  BANK_ACCOUNT_NAME_UPDATED,
  branchAccountantAttemptedNonNameEdit,
  FINANCE_ACCOUNT_NAME_MAX_LENGTH,
  normalizeFinanceAccountName,
} from './finance-account-name.util';
import { assertCanAccessAccountScope, canManageBranchFinanceAccounts } from './finance-access.util';

const branchAccountant = {
  id: 'acc-1',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId: 'branch-a',
  permissions: ['finance.view', 'finance.manage'],
};

const otherBranchAccountant = {
  id: 'acc-2',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId: 'branch-b',
  permissions: ['finance.view', 'finance.manage'],
};

describe('finance account name rename', () => {
  it('trims and accepts a valid account name', () => {
    assert.equal(normalizeFinanceAccountName('  EMOTORS Bishkek Main Account  '), 'EMOTORS Bishkek Main Account');
    assert.equal(
      assertValidFinanceAccountName('  EMOTORS Branch Account  '),
      'EMOTORS Branch Account',
    );
  });

  it('rejects empty account names', () => {
    assert.throws(() => assertValidFinanceAccountName(''), /required/);
    assert.throws(() => assertValidFinanceAccountName('   '), /required/);
    assert.throws(() => assertValidFinanceAccountName(null), /required/);
  });

  it('rejects names longer than the project max length', () => {
    assert.throws(
      () => assertValidFinanceAccountName('x'.repeat(FINANCE_ACCOUNT_NAME_MAX_LENGTH + 1)),
      /at most/,
    );
  });

  it('detects Branch Accountant attempts to edit non-name fields', () => {
    assert.equal(branchAccountantAttemptedNonNameEdit({}), false);
    assert.equal(branchAccountantAttemptedNonNameEdit({ bankName: 'Demo Bank' }), true);
    assert.equal(branchAccountantAttemptedNonNameEdit({ iban: 'KG00' }), true);
  });

  it('Branch Accountant can manage own Branch accounts only', () => {
    assert.equal(canManageBranchFinanceAccounts(branchAccountant), true);
    assert.doesNotThrow(() =>
      assertCanAccessAccountScope(branchAccountant as never, {
        id: 'a1',
        scope: FinanceAccountScope.BRANCH,
        branchId: 'branch-a',
      }),
    );
    assert.throws(
      () =>
        assertCanAccessAccountScope(branchAccountant as never, {
          id: 'hq1',
          scope: FinanceAccountScope.HQ,
          branchId: null,
        }),
      /not accessible from branch/,
    );
    assert.throws(
      () =>
        assertCanAccessAccountScope(otherBranchAccountant as never, {
          id: 'a1',
          scope: FinanceAccountScope.BRANCH,
          branchId: 'branch-a',
        }),
      /Branch isolation/,
    );
  });

  it('exposes BANK_ACCOUNT_NAME_UPDATED audit action constant', () => {
    assert.equal(BANK_ACCOUNT_NAME_UPDATED, 'BANK_ACCOUNT_NAME_UPDATED');
  });
});
