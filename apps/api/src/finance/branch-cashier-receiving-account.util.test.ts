import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS,
  missingReceivingAccountErrorCode,
  resolveBranchCashierReceivingAccount,
} from './branch-cashier-receiving-account.util';

const cashAccount = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Cash ${id}`,
  accountNumber: `CASH-${id}`,
  typeCode: 'CASH',
  currentBalance: 1_000,
  ...overrides,
});

const qrAccount = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `QR ${id}`,
  accountNumber: `QR-${id}`,
  typeCode: 'QR',
  currentBalance: 2_000,
  ...overrides,
});

const bankAccount = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Bank ${id}`,
  accountNumber: `BANK-${id}`,
  typeCode: 'BANK',
  currentBalance: 3_000,
  ...overrides,
});

describe('resolveBranchCashierReceivingAccount', () => {
  it('selects the only eligible cash account', () => {
    const result = resolveBranchCashierReceivingAccount({
      paymentMethod: 'CASH',
      eligibleAccounts: [cashAccount('cash-1')],
    });
    assert.equal(result.status, 'resolved');
    if (result.status === 'resolved') {
      assert.equal(result.account.id, 'cash-1');
      assert.equal(result.resolution, 'single_eligible');
    }
  });

  it('selects the only eligible qr account', () => {
    const result = resolveBranchCashierReceivingAccount({
      paymentMethod: 'QR',
      eligibleAccounts: [qrAccount('qr-1')],
    });
    assert.equal(result.status, 'resolved');
    if (result.status === 'resolved') {
      assert.equal(result.account.id, 'qr-1');
    }
  });

  it('selects the only eligible bank account', () => {
    const result = resolveBranchCashierReceivingAccount({
      paymentMethod: 'BANK',
      eligibleAccounts: [bankAccount('bank-1')],
    });
    assert.equal(result.status, 'resolved');
    if (result.status === 'resolved') {
      assert.equal(result.account.id, 'bank-1');
    }
  });

  it('uses primary assignment when multiple accounts exist', () => {
    const result = resolveBranchCashierReceivingAccount({
      paymentMethod: 'QR',
      eligibleAccounts: [
        qrAccount('qr-1'),
        qrAccount('qr-2', { isPrimaryAssignment: true }),
      ],
    });
    assert.equal(result.status, 'resolved');
    if (result.status === 'resolved') {
      assert.equal(result.account.id, 'qr-2');
      assert.equal(result.resolution, 'primary_assignment');
    }
  });

  it('uses branch default account when configured', () => {
    const result = resolveBranchCashierReceivingAccount({
      paymentMethod: 'CASH',
      branchDefaultAccountId: 'cash-2',
      eligibleAccounts: [cashAccount('cash-1'), cashAccount('cash-2')],
    });
    assert.equal(result.status, 'resolved');
    if (result.status === 'resolved') {
      assert.equal(result.account.id, 'cash-2');
      assert.equal(result.resolution, 'branch_default');
    }
  });

  it('blocks payment when multiple accounts exist without default', () => {
    const result = resolveBranchCashierReceivingAccount({
      paymentMethod: 'QR',
      eligibleAccounts: [qrAccount('qr-1'), qrAccount('qr-2')],
    });
    assert.equal(result.status, 'ambiguous');
    if (result.status === 'ambiguous') {
      assert.equal(result.errorCode, 'NO_DEFAULT_MULTIPLE');
      assert.equal(result.message, BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS.NO_DEFAULT_MULTIPLE);
    }
  });

  it('returns cash-specific missing account message', () => {
    const result = resolveBranchCashierReceivingAccount({
      paymentMethod: 'CASH',
      eligibleAccounts: [],
    });
    assert.equal(result.status, 'missing');
    if (result.status === 'missing') {
      assert.equal(result.errorCode, 'NO_CASH');
      assert.equal(result.message, BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS.NO_CASH);
    }
  });

  it('returns qr-specific missing account message', () => {
    assert.equal(missingReceivingAccountErrorCode('QR'), 'NO_QR');
  });

  it('returns bank-specific missing account message for transfer', () => {
    assert.equal(missingReceivingAccountErrorCode('TRANSFER'), 'NO_BANK');
  });
});
