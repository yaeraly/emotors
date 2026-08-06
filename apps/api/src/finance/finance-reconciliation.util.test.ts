import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReconciliationDifference,
  parseReconciliationActualBalance,
  resolveReconciliationSystemBalance,
} from './finance-reconciliation.util';

describe('finance-reconciliation.util', () => {
  it('parses zero and valid decimals', () => {
    assert.equal(parseReconciliationActualBalance(0), 0);
    assert.equal(parseReconciliationActualBalance('98500.5'), 98500.5);
  });

  it('rejects invalid actual balance', () => {
    assert.equal(parseReconciliationActualBalance(''), null);
    assert.equal(parseReconciliationActualBalance('abc'), null);
    assert.equal(parseReconciliationActualBalance(-1), null);
  });

  it('calculates positive and negative differences', () => {
    assert.equal(calculateReconciliationDifference(102000, 100000), 2000);
    assert.equal(calculateReconciliationDifference(98500, 100000), -1500);
  });

  it('uses available balance as system balance', () => {
    assert.equal(
      resolveReconciliationSystemBalance({ availableBalance: 150000, currentBalance: 140000 }),
      150000,
    );
  });
});
