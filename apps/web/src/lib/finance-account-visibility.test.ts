import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canShowHqCashierAccountTransferMenu,
  countActiveUsableFinanceAccounts,
  isActiveUsableFinanceAccount,
} from './finance-account-visibility';

describe('finance account visibility', () => {
  it('counts only active non-deleted accounts', () => {
    assert.equal(isActiveUsableFinanceAccount({ status: 'ACTIVE' }), true);
    assert.equal(isActiveUsableFinanceAccount({ status: 'INACTIVE' }), false);
    assert.equal(isActiveUsableFinanceAccount({ status: 'ARCHIVED' }), false);
    assert.equal(isActiveUsableFinanceAccount({ status: 'ACTIVE', deletedAt: '2026-01-01' }), false);
    assert.equal(
      countActiveUsableFinanceAccounts([
        { status: 'ACTIVE' },
        { status: 'INACTIVE' },
        { status: 'ARCHIVED' },
        { status: 'ACTIVE', deletedAt: '2026-01-01' },
        { status: 'ACTIVE' },
      ]),
      2,
    );
  });

  it('shows HQ cashier transfer menu only with two or more usable accounts', () => {
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
        { status: 'INACTIVE' },
      ]),
      false,
    );
  });
});

console.log('finance-account-visibility.test.ts passed');
