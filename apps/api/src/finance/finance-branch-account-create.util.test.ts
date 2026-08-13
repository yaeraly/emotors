import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FinanceAccountScope } from '@prisma/client';
import {
  assertBranchAccountantCanCreateAccount,
  buildBranchAccountDuplicateWhere,
  parseNonNegativeOpeningBalance,
  resolveBranchAccountCreateAuditAction,
  shouldPostOpeningBalanceLedger,
  validateBranchAccountTypeFields,
  BRANCH_ACCOUNT_AUDIT,
} from './finance-branch-account-create.util';

const branchAccountant = {
  role: 'ACCOUNTANT' as const,
  roles: ['ACCOUNTANT' as const],
  permissions: ['finance.manage'],
  branchId: 'branch-a',
};

describe('parseNonNegativeOpeningBalance', () => {
  it('defaults missing opening balance to zero', () => {
    assert.equal(parseNonNegativeOpeningBalance(undefined), 0);
    assert.equal(parseNonNegativeOpeningBalance(null), 0);
    assert.equal(parseNonNegativeOpeningBalance(''), 0);
  });

  it('accepts zero opening balance', () => {
    assert.equal(parseNonNegativeOpeningBalance(0), 0);
    assert.equal(parseNonNegativeOpeningBalance('0'), 0);
  });

  it('rejects negative and invalid values', () => {
    assert.throws(() => parseNonNegativeOpeningBalance(-1), /отрицательным/);
    assert.throws(() => parseNonNegativeOpeningBalance(Number.NaN), /корректным числом/);
    assert.throws(() => parseNonNegativeOpeningBalance(Number.POSITIVE_INFINITY), /корректным числом/);
  });
});

describe('branch accountant account creation rules', () => {
  it('allows bank and qr types for branch accountant', () => {
    assert.doesNotThrow(() =>
      assertBranchAccountantCanCreateAccount(branchAccountant, {
        typeCode: 'BANK',
        name: 'Main bank',
      }),
    );
    assert.doesNotThrow(() =>
      assertBranchAccountantCanCreateAccount(branchAccountant, {
        typeCode: 'QR',
        name: 'QR MBANK',
      }),
    );
  });

  it('rejects hq ownership and other branches', () => {
    assert.throws(
      () =>
        assertBranchAccountantCanCreateAccount(branchAccountant, {
          typeCode: 'BANK',
          name: 'HQ bank',
          scope: FinanceAccountScope.HQ,
        }),
      /branch-owned/,
    );
    assert.throws(
      () =>
        assertBranchAccountantCanCreateAccount(branchAccountant, {
          typeCode: 'BANK',
          name: 'Other branch',
          branchId: 'branch-b',
        }),
      /another branch/,
    );
  });

  it('rejects unsupported account types', () => {
    assert.throws(
      () =>
        assertBranchAccountantCanCreateAccount(branchAccountant, {
          typeCode: 'CASH',
          name: 'Cashbox',
        }),
      /bank or QR/,
    );
  });
});

describe('type-specific validation', () => {
  it('requires bank fields for bank accounts', () => {
    assert.throws(
      () =>
        validateBranchAccountTypeFields({
          typeCode: 'BANK',
          name: 'Main bank',
        }),
      /банка/,
    );
    assert.throws(
      () =>
        validateBranchAccountTypeFields({
          typeCode: 'BANK',
          name: 'Main bank',
          bankName: 'Optima',
        }),
      /номер/,
    );
  });

  it('requires qr provider for qr accounts', () => {
    assert.throws(
      () =>
        validateBranchAccountTypeFields({
          typeCode: 'QR',
          name: 'QR MBANK',
        }),
      /QR-сервис/,
    );
  });
});

describe('opening balance ledger policy', () => {
  it('does not post ledger for zero opening balance', () => {
    assert.equal(shouldPostOpeningBalanceLedger(0), false);
    assert.equal(shouldPostOpeningBalanceLedger(0.009), true);
  });
});

describe('audit actions and duplicate checks', () => {
  it('emits zero-balance audit action for bank and qr', () => {
    assert.deepEqual(resolveBranchAccountCreateAuditAction('BANK', 0), [
      BRANCH_ACCOUNT_AUDIT.BANK_CREATED,
      BRANCH_ACCOUNT_AUDIT.ZERO_BALANCE_CREATED,
    ]);
    assert.deepEqual(resolveBranchAccountCreateAuditAction('QR', 0), [
      BRANCH_ACCOUNT_AUDIT.QR_CREATED,
      BRANCH_ACCOUNT_AUDIT.ZERO_BALANCE_CREATED,
    ]);
  });

  it('builds duplicate checks for branch bank and qr identifiers', () => {
    const checks = buildBranchAccountDuplicateWhere('branch-a', {
      typeCode: 'BANK',
      name: 'Main bank',
      bankAccountNo: '123',
      qrMerchantId: 'qr-1',
    });
    assert.equal(checks.length, 2);
    assert.equal(checks[0]?.message.includes('названием'), true);
    assert.equal(checks[1]?.where.bankAccountNo, '123');
  });
});
