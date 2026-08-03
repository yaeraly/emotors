import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INVOICE_ALREADY_PAID_MESSAGE,
  reconcilePaymentAccountDelta,
  resolveBranchCashierNetPayment,
} from './branch-cashier-payment.util';

describe('resolveBranchCashierNetPayment', () => {
  it('full payment credits only remaining debt when customer overpays', () => {
    const result = resolveBranchCashierNetPayment({
      remainingDebt: 10_000,
      isFullPayment: true,
      receivedAmount: 12_000,
    });
    assert.equal(result.netAcceptedAmount, 10_000);
    assert.equal(result.receivedAmount, 12_000);
    assert.equal(result.changeAmount, 2_000);
  });

  it('partial installment payment uses accepted amount', () => {
    const result = resolveBranchCashierNetPayment({
      remainingDebt: 50_000,
      isFullPayment: false,
      amount: 20_000,
      receivedAmount: 20_000,
    });
    assert.equal(result.netAcceptedAmount, 20_000);
    assert.equal(result.changeAmount, null);
  });

  it('partial payment rejects amount above remaining debt', () => {
    assert.throws(
      () =>
        resolveBranchCashierNetPayment({
          remainingDebt: 5_000,
          isFullPayment: false,
          amount: 6_000,
        }),
      /Максимальная сумма платежа/,
    );
  });

  it('rejects already paid invoice', () => {
    assert.throws(
      () =>
        resolveBranchCashierNetPayment({
          remainingDebt: 0,
          isFullPayment: true,
          receivedAmount: 1_000,
        }),
      (error: Error) => error.message === INVOICE_ALREADY_PAID_MESSAGE,
    );
  });

  it('partial payment with change credits net only', () => {
    const result = resolveBranchCashierNetPayment({
      remainingDebt: 20_000,
      isFullPayment: false,
      amount: 15_000,
      receivedAmount: 18_000,
      changeAmount: 3_000,
    });
    assert.equal(result.netAcceptedAmount, 15_000);
    assert.equal(result.receivedAmount, 18_000);
    assert.equal(result.changeAmount, 3_000);
  });
});

describe('reconcilePaymentAccountDelta', () => {
  it('matches ledger delta to net accepted amount', () => {
    const result = reconcilePaymentAccountDelta({
      netAcceptedAmount: 10_000,
      beforeBalance: 50_000,
      afterBalance: 60_000,
    });
    assert.equal(result.matches, true);
    assert.equal(result.delta, 10_000);
    assert.equal(result.difference, 0);
  });

  it('detects mismatch between payment and balance delta', () => {
    const result = reconcilePaymentAccountDelta({
      netAcceptedAmount: 10_000,
      beforeBalance: 50_000,
      afterBalance: 61_000,
    });
    assert.equal(result.matches, false);
    assert.equal(result.difference, 1_000);
  });
});
