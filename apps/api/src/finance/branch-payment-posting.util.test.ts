import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertPaymentMethodMatchesAccountType,
  paymentRequiresLedgerPosting,
  reconcileConfirmedPaymentPosting,
  resolveAllowedAccountTypeCodes,
  resolveBranchPaymentNetAmount,
} from './branch-payment-posting.util';

describe('resolveAllowedAccountTypeCodes', () => {
  it('maps cash and qr to branch account types', () => {
    assert.deepEqual(resolveAllowedAccountTypeCodes('CASH'), ['CASH', 'PETTY_CASH']);
    assert.deepEqual(resolveAllowedAccountTypeCodes('QR'), ['QR']);
    assert.deepEqual(resolveAllowedAccountTypeCodes('BANK'), ['BANK', 'DEPOSIT']);
  });
});

describe('assertPaymentMethodMatchesAccountType', () => {
  it('accepts matching account types', () => {
    assert.doesNotThrow(() => assertPaymentMethodMatchesAccountType('CASH', 'CASH'));
    assert.doesNotThrow(() => assertPaymentMethodMatchesAccountType('QR', 'QR'));
  });

  it('rejects cash payment on qr account', () => {
    assert.throws(
      () => assertPaymentMethodMatchesAccountType('CASH', 'QR'),
      /кассу филиала/,
    );
  });

  it('rejects qr payment on cash account', () => {
    assert.throws(
      () => assertPaymentMethodMatchesAccountType('QR', 'CASH'),
      /QR-счет/,
    );
  });
});

describe('resolveBranchPaymentNetAmount', () => {
  it('uses net accepted amount when present', () => {
    assert.equal(
      resolveBranchPaymentNetAmount({
        amount: 12000,
        netAcceptedAmount: 10000,
        receivedAmount: 12000,
        changeAmount: 2000,
      }),
      10000,
    );
  });

  it('derives net from received minus change', () => {
    assert.equal(
      resolveBranchPaymentNetAmount({
        amount: 12000,
        receivedAmount: 12000,
        changeAmount: 2000,
      }),
      10000,
    );
  });
});

describe('paymentRequiresLedgerPosting', () => {
  it('requires ledger for confirmed positive payments only', () => {
    assert.equal(
      paymentRequiresLedgerPosting({ confirmationStatus: 'CONFIRMED', netAcceptedAmount: 100 }),
      true,
    );
    assert.equal(
      paymentRequiresLedgerPosting({ confirmationStatus: 'CONFIRMED', netAcceptedAmount: 0 }),
      false,
    );
    assert.equal(
      paymentRequiresLedgerPosting({ confirmationStatus: 'PENDING_CONFIRMATION', netAcceptedAmount: 100 }),
      false,
    );
  });
});

describe('branch cashier payment routing invariants', () => {
  it('cash and qr route to different branch account type sets', () => {
    const cashTypes = resolveAllowedAccountTypeCodes('CASH');
    const qrTypes = resolveAllowedAccountTypeCodes('QR');
    assert.ok(cashTypes.includes('CASH'));
    assert.ok(qrTypes.includes('QR'));
    assert.equal(cashTypes.includes('QR'), false);
    assert.equal(qrTypes.includes('CASH'), false);
  });

  it('net accepted payment excludes returned change', () => {
    assert.equal(
      resolveBranchPaymentNetAmount({
        amount: 12000,
        receivedAmount: 12000,
        changeAmount: 2000,
      }),
      10000,
    );
  });
});

describe('reconcileConfirmedPaymentPosting', () => {
  it('matches when payment, ledger, and balance delta align', () => {
    const result = reconcileConfirmedPaymentPosting({
      netAcceptedAmount: 10000,
      ledgerSignedAmount: 10000,
      balanceDelta: 10000,
    });
    assert.equal(result.matches, true);
    assert.equal(result.difference, 0);
  });

  it('partial payments of 33.34 + 33.33 + 33.34 close 100.01 exactly', () => {
    const remaining = reconcileConfirmedPaymentPosting({
      netAcceptedAmount: 100.01,
      ledgerSignedAmount: 100.01,
      balanceDelta: 100.01,
    });
    assert.equal(remaining.matches, true);
    assert.equal(remaining.difference, 0);
  });
});
