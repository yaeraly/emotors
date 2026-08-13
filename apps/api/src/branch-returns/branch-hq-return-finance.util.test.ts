import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeBranchHqReturnDebtAdjustment } from './branch-hq-return-finance.util';

describe('branch hq return finance adjustment', () => {
  it('credits debt without creating sales revenue or profit', () => {
    const result = computeBranchHqReturnDebtAdjustment({
      acceptedReturnValueKgs: 15000,
      currentDebtKgs: 40000,
    });
    assert.equal(result.appliedCreditKgs, 15000);
    assert.equal(result.resultingDebtKgs, 25000);
    assert.equal(result.remainingCreditKgs, 0);
    assert.equal(result.salesRevenueKgs, 0);
    assert.equal(result.profitKgs, 0);
  });

  it('never drives debt below zero and preserves leftover credit', () => {
    const result = computeBranchHqReturnDebtAdjustment({
      acceptedReturnValueKgs: 15000,
      currentDebtKgs: 10000,
    });
    assert.equal(result.appliedCreditKgs, 10000);
    assert.equal(result.resultingDebtKgs, 0);
    assert.equal(result.remainingCreditKgs, 5000);
    assert.equal(result.salesRevenueKgs, 0);
    assert.equal(result.profitKgs, 0);
  });

  it('hq branch return also produces zero profit', () => {
    const result = computeBranchHqReturnDebtAdjustment({
      acceptedReturnValueKgs: 15000,
      currentDebtKgs: 0,
    });
    assert.equal(result.appliedCreditKgs, 0);
    assert.equal(result.remainingCreditKgs, 15000);
    assert.equal(result.profitKgs, 0);
    assert.equal(result.salesRevenueKgs, 0);
  });
});
