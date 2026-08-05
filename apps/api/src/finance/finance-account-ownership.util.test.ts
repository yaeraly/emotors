import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FinanceAccountScope, FinanceAccountStatus, Role } from '@prisma/client';
import {
  assertAccountUsableByOwner,
  assertFinanceAccountOwnershipInvariant,
  buildSelectableOwnerAccountsWhere,
  canBrowseAllFinanceAccounts,
  canManageOwnBranchAccounts,
  resolveFinanceAccountOwner,
} from './finance-account-ownership.util';
import {
  assertCanAccessAccountScope,
  canManageBranchFinanceAccounts,
  canManageFinanceAccounts,
  resolveFinanceScopeFilter,
} from './finance-access.util';

const hqCeo = {
  id: 'ceo',
  role: Role.CEO,
  roles: [Role.CEO],
  branchId: null,
  permissions: ['finance.view', 'finance.manage'],
};

const hqAccountant = {
  id: 'hq-acc',
  role: Role.HQ_ACCOUNTANT,
  roles: [Role.HQ_ACCOUNTANT],
  branchId: null,
  permissions: ['finance.view', 'finance.manage', 'payments.manage'],
};

const hqFinance = {
  id: 'hq-fin',
  role: Role.FINANCE_MANAGER,
  roles: [Role.FINANCE_MANAGER],
  branchId: null,
  permissions: ['finance.view', 'finance.manage'],
};

const branchCeo = {
  id: 'b-ceo',
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-a',
  permissions: ['finance.view', 'payments.manage'],
};

const branchAccountant = {
  id: 'b-acc',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId: 'branch-a',
  permissions: ['finance.view', 'finance.manage', 'payments.manage'],
};

const branchCashier = {
  id: 'b-cash',
  role: Role.CASHIER,
  roles: [Role.CASHIER],
  branchId: 'branch-a',
  permissions: ['payments.manage', 'cashier'],
};

const otherBranchAccountant = {
  id: 'b-acc-2',
  role: Role.ACCOUNTANT,
  roles: [Role.ACCOUNTANT],
  branchId: 'branch-b',
  permissions: ['finance.view', 'finance.manage'],
};

const hqAccount = {
  id: 'acc-hq',
  scope: FinanceAccountScope.HQ,
  branchId: null,
  status: FinanceAccountStatus.ACTIVE,
  deletedAt: null,
};

const branchAAccount = {
  id: 'acc-a',
  scope: FinanceAccountScope.BRANCH,
  branchId: 'branch-a',
  status: FinanceAccountStatus.ACTIVE,
  deletedAt: null,
};

const branchBAccount = {
  id: 'acc-b',
  scope: FinanceAccountScope.BRANCH,
  branchId: 'branch-b',
  status: FinanceAccountStatus.ACTIVE,
  deletedAt: null,
};

describe('FinanceAccount ownership invariants', () => {
  it('HQ account belongs only to HQ (branchId null)', () => {
    assert.doesNotThrow(() =>
      assertFinanceAccountOwnershipInvariant({
        scope: FinanceAccountScope.HQ,
        branchId: null,
      }),
    );
    assert.throws(
      () =>
        assertFinanceAccountOwnershipInvariant({
          scope: FinanceAccountScope.HQ,
          branchId: 'branch-a',
        }),
      /cannot belong to a branch/,
    );
  });

  it('Branch account belongs only to one Branch', () => {
    assert.doesNotThrow(() =>
      assertFinanceAccountOwnershipInvariant({
        scope: FinanceAccountScope.BRANCH,
        branchId: 'branch-a',
      }),
    );
    assert.throws(
      () =>
        assertFinanceAccountOwnershipInvariant({
          scope: FinanceAccountScope.BRANCH,
          branchId: null,
        }),
      /exactly one branch/,
    );
  });

  it('resolveFinanceAccountOwner never creates an ownerless account', () => {
    assert.deepEqual(
      resolveFinanceAccountOwner({ scope: FinanceAccountScope.HQ }),
      { scope: FinanceAccountScope.HQ, branchId: null },
    );
    assert.deepEqual(
      resolveFinanceAccountOwner({
        scope: FinanceAccountScope.BRANCH,
        userBranchId: 'branch-a',
      }),
      { scope: FinanceAccountScope.BRANCH, branchId: 'branch-a' },
    );
    assert.throws(() =>
      resolveFinanceAccountOwner({ scope: FinanceAccountScope.BRANCH }),
    );
  });
});

describe('FinanceAccount access by role', () => {
  it('Branch Accountant cannot see HQ accounts', () => {
    assert.throws(
      () => assertCanAccessAccountScope(branchAccountant as never, hqAccount),
      /not accessible from branch/,
    );
  });

  it('Branch Accountant cannot see another Branch accounts', () => {
    assert.throws(
      () => assertCanAccessAccountScope(otherBranchAccountant as never, branchAAccount),
      /Branch isolation/,
    );
  });

  it('Branch Cashier can pay only from own Branch accounts', () => {
    assert.doesNotThrow(() =>
      assertAccountUsableByOwner(branchCashier as never, branchAAccount, {
        expectedBranchId: 'branch-a',
      }),
    );
    assert.throws(
      () => assertAccountUsableByOwner(branchCashier as never, hqAccount),
      /cannot use HQ/,
    );
    assert.throws(
      () => assertAccountUsableByOwner(branchCashier as never, branchBAccount),
      /another branch/,
    );
  });

  it('HQ Accountant can use only HQ accounts', () => {
    assert.doesNotThrow(() =>
      assertCanAccessAccountScope(hqAccountant as never, hqAccount),
    );
    assert.throws(
      () => assertCanAccessAccountScope(hqAccountant as never, branchAAccount),
      /не принадлежит HQ/,
    );
    assert.throws(
      () => assertAccountUsableByOwner(hqAccountant as never, branchAAccount),
      /only use HQ|must use HQ/,
    );
  });

  it('HQ CEO can view all accounts', () => {
    assert.equal(canBrowseAllFinanceAccounts(hqCeo), true);
    assert.doesNotThrow(() => assertCanAccessAccountScope(hqCeo as never, hqAccount));
    assert.doesNotThrow(() => assertCanAccessAccountScope(hqCeo as never, branchAAccount));
    assert.doesNotThrow(() => assertCanAccessAccountScope(hqCeo as never, branchBAccount));
  });

  it('HQ Finance Manager can browse Branch accounts', () => {
    assert.equal(canBrowseAllFinanceAccounts(hqFinance), true);
    assert.doesNotThrow(() => assertCanAccessAccountScope(hqFinance as never, branchAAccount));
  });

  it('Branch CEO can manage only own Branch accounts', () => {
    assert.equal(canManageOwnBranchAccounts(branchCeo), true);
    assert.equal(canManageBranchFinanceAccounts(branchCeo), true);
    assert.equal(canManageFinanceAccounts(branchCeo), true);
    assert.doesNotThrow(() => assertCanAccessAccountScope(branchCeo as never, branchAAccount));
    assert.throws(
      () => assertCanAccessAccountScope(branchCeo as never, branchBAccount),
      /Branch isolation/,
    );
  });

  it('resolveFinanceScopeFilter isolates Branch and HQ Accountant', () => {
    assert.deepEqual(resolveFinanceScopeFilter(branchAccountant as never), {
      scope: FinanceAccountScope.BRANCH,
      branchId: 'branch-a',
    });
    assert.deepEqual(resolveFinanceScopeFilter(hqAccountant as never), {
      scope: FinanceAccountScope.HQ,
      branchId: null,
    });
    assert.deepEqual(resolveFinanceScopeFilter(hqCeo as never), {});
  });

  it('branch CEO, accountant, and cashier query the same branch-owned accounts', () => {
    const ceoWhere = buildSelectableOwnerAccountsWhere(branchCeo as never);
    const accountantWhere = buildSelectableOwnerAccountsWhere(branchAccountant as never);
    const cashierWhere = buildSelectableOwnerAccountsWhere(branchCashier as never, { forPayment: true });
    assert.deepEqual(ceoWhere.scope, accountantWhere.scope);
    assert.deepEqual(ceoWhere.branchId, accountantWhere.branchId);
    assert.equal(ceoWhere.scope, FinanceAccountScope.BRANCH);
    assert.equal(cashierWhere.scope, FinanceAccountScope.BRANCH);
    assert.equal(cashierWhere.branchId, 'branch-a');
  });

  it('payment selector filters exclude inactive and deleted accounts', () => {
    const where = buildSelectableOwnerAccountsWhere(branchAccountant as never, {
      forPayment: true,
    });
    assert.equal(where.scope, FinanceAccountScope.BRANCH);
    assert.equal(where.branchId, 'branch-a');
    assert.equal(where.status, FinanceAccountStatus.ACTIVE);
    assert.equal(where.deletedAt, null);

    assert.throws(
      () =>
        assertAccountUsableByOwner(branchAccountant as never, {
          ...branchAAccount,
          status: FinanceAccountStatus.BLOCKED,
        }),
      /active accounts/,
    );
    assert.throws(
      () =>
        assertAccountUsableByOwner(branchAccountant as never, {
          ...branchAAccount,
          deletedAt: new Date(),
        }),
      /Deleted accounts/,
    );
  });

  it('cross-branch account selection is rejected', () => {
    assert.throws(
      () =>
        assertAccountUsableByOwner(branchAccountant as never, branchBAccount, {
          expectedBranchId: 'branch-a',
        }),
      /another branch|invoice branch/,
    );
  });

  it('invoice creation does not require a bank account field on ownership helpers', () => {
    // Branch invoice creation uses distribution approve/send and has no financeAccountId requirement.
    // Ownership helpers only apply when an account is explicitly selected for payment.
    assert.equal(
      'financeAccountId' in buildSelectableOwnerAccountsWhere(branchAccountant as never),
      false,
    );
  });

  it('HQ payment selector returns only HQ ACTIVE accounts', () => {
    const where = buildSelectableOwnerAccountsWhere(hqAccountant as never, {
      forPayment: true,
    });
    assert.equal(where.scope, FinanceAccountScope.HQ);
    assert.equal(where.branchId, null);
    assert.equal(where.status, FinanceAccountStatus.ACTIVE);
  });
});
