import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reconcileConfirmedPaymentPosting,
  resolveAllowedAccountTypeCodes,
} from './branch-payment-posting.util';

describe('branch payment posting repair helpers', () => {
  it('detects missing ledger posting when confirmed payment has no balance effect', () => {
    const result = reconcileConfirmedPaymentPosting({
      netAcceptedAmount: 10000,
      ledgerSignedAmount: 0,
      balanceDelta: 0,
    });
    assert.equal(result.matches, false);
    assert.equal(result.difference, 10000);
  });

  it('treats already posted payment as reconciled', () => {
    const result = reconcileConfirmedPaymentPosting({
      netAcceptedAmount: 10000,
      ledgerSignedAmount: 10000,
      balanceDelta: 10000,
    });
    assert.equal(result.matches, true);
    assert.equal(result.difference, 0);
  });

  it('maps cash and qr to distinct branch account types for repair routing', () => {
    assert.deepEqual(resolveAllowedAccountTypeCodes('CASH'), ['CASH', 'PETTY_CASH']);
    assert.deepEqual(resolveAllowedAccountTypeCodes('QR'), ['QR']);
    assert.notDeepEqual(
      resolveAllowedAccountTypeCodes('CASH'),
      resolveAllowedAccountTypeCodes('QR'),
    );
  });
});
