import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BRANCH_MULTI_METHOD_PAYMENT_ERRORS,
  BRANCH_SPLIT_PAYMENT_ERRORS,
  resolveMultiMethodCashierPayment,
  resolveSplitCashierPayment,
} from './branch-cashier-split-payment.util';

describe('resolveMultiMethodCashierPayment', () => {
  it('splits full payment with cash change across cash and qr', () => {
    const result = resolveMultiMethodCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      allocations: [
        { method: 'CASH', grossAmount: 50_000 },
        { method: 'QR', grossAmount: 60_000 },
      ],
    });
    assert.equal(result.totalNetAmount, 100_000);
    assert.equal(result.cashChangeAmount, 10_000);
    assert.equal(result.cashNetAmount, 40_000);
    assert.equal(result.allocations.find((row) => row.method === 'QR')?.netAmount, 60_000);
  });

  it('accepts cash + bank + qr full payment', () => {
    const result = resolveMultiMethodCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      allocations: [
        { method: 'CASH', grossAmount: 20_000 },
        { method: 'QR', grossAmount: 30_000 },
        { method: 'BANK', grossAmount: 50_000 },
      ],
    });
    assert.equal(result.totalNetAmount, 100_000);
    assert.equal(result.remainingAfterPayment, 0);
    assert.equal(result.allocations.length, 3);
  });

  it('accepts bank-only full payment', () => {
    const result = resolveMultiMethodCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      allocations: [{ method: 'BANK', grossAmount: 100_000 }],
    });
    assert.equal(result.totalNetAmount, 100_000);
    assert.equal(result.cashChangeAmount, 0);
  });

  it('accepts partial installment repayment with multiple methods', () => {
    const result = resolveMultiMethodCashierPayment({
      payableAmount: 80_000,
      isFullPayment: false,
      allocations: [
        { method: 'CASH', grossAmount: 10_000 },
        { method: 'QR', grossAmount: 15_000 },
      ],
    });
    assert.equal(result.totalNetAmount, 25_000);
    assert.equal(result.remainingAfterPayment, 55_000);
  });

  it('rejects non-cash total above payable amount', () => {
    assert.throws(
      () =>
        resolveMultiMethodCashierPayment({
          payableAmount: 50_000,
          isFullPayment: true,
          allocations: [
            { method: 'QR', grossAmount: 30_000 },
            { method: 'BANK', grossAmount: 30_000 },
          ],
        }),
      (error: Error) => error.message === BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NON_CASH_OVER_PAYABLE,
    );
  });

  it('rejects duplicate payment methods', () => {
    assert.throws(
      () =>
        resolveMultiMethodCashierPayment({
          payableAmount: 100_000,
          isFullPayment: true,
          allocations: [
            { method: 'QR', grossAmount: 40_000 },
            { method: 'QR', grossAmount: 60_000 },
          ],
        }),
      (error: Error) => error.message === BRANCH_MULTI_METHOD_PAYMENT_ERRORS.DUPLICATE_METHOD,
    );
  });

  it('rejects full payment underpayment', () => {
    assert.throws(
      () =>
        resolveMultiMethodCashierPayment({
          payableAmount: 100_000,
          isFullPayment: true,
          allocations: [
            { method: 'CASH', grossAmount: 20_000 },
            { method: 'QR', grossAmount: 30_000 },
          ],
        }),
      (error: Error) => error.message === BRANCH_MULTI_METHOD_PAYMENT_ERRORS.FULL_PAYMENT_UNDER,
    );
  });

  it('handles installment overpayment via cash change', () => {
    const result = resolveMultiMethodCashierPayment({
      payableAmount: 25_000,
      isFullPayment: false,
      allocations: [
        { method: 'CASH', grossAmount: 20_000 },
        { method: 'QR', grossAmount: 10_000 },
      ],
    });
    assert.equal(result.cashNetAmount, 15_000);
    assert.equal(result.cashChangeAmount, 5_000);
    assert.equal(result.totalNetAmount, 25_000);
  });
});

describe('resolveSplitCashierPayment backward compatibility', () => {
  it('keeps cash + qr split behavior', () => {
    const result = resolveSplitCashierPayment({
      payableAmount: 100_000,
      isFullPayment: true,
      cashGrossAmount: 50_000,
      qrGrossAmount: 60_000,
    });
    assert.equal(result.qrNetAmount, 60_000);
    assert.equal(result.cashNetAmount, 40_000);
    assert.equal(result.cashChangeAmount, 10_000);
  });

  it('maps qr overpayment to non-cash over error alias', () => {
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
});
