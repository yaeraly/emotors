import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBranchOrderInstallmentSchedule,
  computeBranchOrderRemainingDebt,
  isZeroInitialPayment,
  sumBranchOrderInstallmentSchedule,
  validateBranchOrderInstallmentAmounts,
} from './branch-order-installment.util';

describe('branch-order-installment.util', () => {
  it('accepts zero initial payment when order total is positive', () => {
    assert.equal(validateBranchOrderInstallmentAmounts(100000, 0), null);
    assert.equal(computeBranchOrderRemainingDebt(100000, 0), 100000);
    assert.equal(isZeroInitialPayment(0), true);
  });

  it('rejects negative initial payment', () => {
    assert.equal(validateBranchOrderInstallmentAmounts(100000, -1), 'NEGATIVE_INITIAL_PAYMENT');
  });

  it('rejects initial payment above total', () => {
    assert.equal(validateBranchOrderInstallmentAmounts(100000, 100001), 'INITIAL_PAYMENT_EXCEEDS_TOTAL');
  });

  it('rejects zero total order', () => {
    assert.equal(validateBranchOrderInstallmentAmounts(0, 0), 'ORDER_TOTAL_REQUIRED');
  });

  it('builds schedule that sums to remaining debt', () => {
    const schedule = buildBranchOrderInstallmentSchedule(100000, 3, new Date('2026-01-15T00:00:00.000Z'));
    assert.equal(schedule.length, 3);
    assert.equal(sumBranchOrderInstallmentSchedule(schedule), 100000);
  });

  it('puts rounding remainder in the final installment', () => {
    const schedule = buildBranchOrderInstallmentSchedule(100, 3, new Date('2026-01-15T00:00:00.000Z'));
    assert.equal(sumBranchOrderInstallmentSchedule(schedule), 100);
    assert.equal(schedule[2].amount, 33.34);
  });
});
