import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertFullPaymentReceivedAmount,
  computeFullPaymentChange,
  FULL_PAYMENT_UNDERPAYMENT_MESSAGE,
  parseFullPaymentReceivedAmount,
  roundFullPaymentMoney,
} from './sale-full-payment.util';

describe('sale full payment change calculation', () => {
  it('auto-fills equivalent total when received amount omitted', () => {
    const result = computeFullPaymentChange(100_000, 100_000);
    assert.equal(result.changeAmount, 0);
    assert.equal(result.isUnderpayment, false);
  });

  it('calculates change when received exceeds total', () => {
    const result = computeFullPaymentChange(100_000, 120_000);
    assert.equal(result.changeAmount, 20_000);
    assert.equal(result.isUnderpayment, false);
  });

  it('rejects underpayment for full payment', () => {
    const result = computeFullPaymentChange(100_000, 99_999);
    assert.equal(result.isUnderpayment, true);
    assert.throws(
      () => assertFullPaymentReceivedAmount(100_000, 99_999),
      (error: Error) => error.message === FULL_PAYMENT_UNDERPAYMENT_MESSAGE,
    );
  });

  it('rejects invalid received amounts', () => {
    assert.equal(parseFullPaymentReceivedAmount(-1), null);
    assert.equal(parseFullPaymentReceivedAmount(Number.NaN), null);
    assert.equal(parseFullPaymentReceivedAmount(''), null);
  });

  it('uses rounded money utility instead of raw floats', () => {
    assert.equal(roundFullPaymentMoney(10.005), 10.01);
    const result = computeFullPaymentChange(99.99, 100);
    assert.equal(result.changeAmount, 0.01);
  });

  it('does not trust frontend change amount and recalculates from authoritative total', () => {
    const authoritativeTotal = 100_000;
    const received = 105_000;
    const trusted = computeFullPaymentChange(authoritativeTotal, received);
    assert.equal(trusted.changeAmount, 5_000);
    assert.notEqual(trusted.changeAmount, 999);
  });
});
