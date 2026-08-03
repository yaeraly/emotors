import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BRANCH_SPLIT_PAYMENT_ERRORS,
  resolveSplitCashierPayment,
} from './branch-cashier-split-payment.util';

describe('resolveSplitCashierPayment', () => {
  it('splits full payment with cash change', () => {
    const result = resolveSplitCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      cashGrossAmount: 50_000,
      qrGrossAmount: 60_000,
    });
    assert.equal(result.qrNetAmount, 60_000);
    assert.equal(result.cashNetAmount, 40_000);
    assert.equal(result.cashChangeAmount, 10_000);
    assert.equal(result.totalNetAmount, 100_000);
    assert.equal(result.remainingAfterPayment, 0);
  });

  it('accepts cash-only full payment', () => {
    const result = resolveSplitCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      cashGrossAmount: 110_000,
      qrGrossAmount: 0,
    });
    assert.equal(result.cashNetAmount, 100_000);
    assert.equal(result.cashChangeAmount, 10_000);
    assert.equal(result.totalNetAmount, 100_000);
  });

  it('accepts qr-only full payment', () => {
    const result = resolveSplitCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      cashGrossAmount: 0,
      qrGrossAmount: 100_000,
    });
    assert.equal(result.qrNetAmount, 100_000);
    assert.equal(result.cashNetAmount, 0);
    assert.equal(result.totalNetAmount, 100_000);
  });

  it('accepts partial installment repayment split', () => {
    const result = resolveSplitCashierPayment({
      payableAmount: 80_000,
      isFullPayment: false,
      cashGrossAmount: 10_000,
      qrGrossAmount: 15_000,
    });
    assert.equal(result.totalNetAmount, 25_000);
    assert.equal(result.remainingAfterPayment, 55_000);
  });

  it('rejects qr above payable amount', () => {
    assert.throws(
      () =>
        resolveSplitCashierPayment({
          payableAmount: 50_000,
          isFullPayment: true,
          cashGrossAmount: 0,
          qrGrossAmount: 60_000,
        }),
      (error: Error) => error.message === BRANCH_SPLIT_PAYMENT_ERRORS.QR_OVER_PAYABLE,
    );
  });

  it('rejects full payment underpayment', () => {
    assert.throws(
      () =>
        resolveSplitCashierPayment({
          payableAmount: 100_000,
          isFullPayment: true,
          cashGrossAmount: 20_000,
          qrGrossAmount: 30_000,
        }),
      (error: Error) => error.message === BRANCH_SPLIT_PAYMENT_ERRORS.FULL_PAYMENT_UNDER,
    );
  });

  it('handles installment overpayment via cash change', () => {
    const result = resolveSplitCashierPayment({
      payableAmount: 25_000,
      isFullPayment: false,
      cashGrossAmount: 20_000,
      qrGrossAmount: 10_000,
    });
    assert.equal(result.cashNetAmount, 15_000);
    assert.equal(result.cashChangeAmount, 5_000);
    assert.equal(result.totalNetAmount, 25_000);
    assert.equal(result.remainingAfterPayment, 0);
  });
});
