import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getFrozenBranchPrice,
  requestLineTotal,
  requestOrderTotal,
} from './branch-purchase-request-display.util';

const t = (key: string) => key;

describe('branch purchase request display totals', () => {
  it('calculates line total as quantity times branch price', () => {
    const total = requestLineTotal({
      quantity: 5,
      branchPurchasePriceKgs: 12000,
      totalAmount: 0,
    });
    assert.equal(total, 60000);
  });

  it('does not silently stay zero when branch price exists but totalAmount is zero', () => {
    const total = requestLineTotal({
      quantity: 3,
      branchPurchasePriceKgs: 4500,
      totalAmount: 0,
    });
    assert.equal(total, 13500);
  });

  it('prefers authoritative totalAmount when positive', () => {
    const total = requestLineTotal({
      quantity: 5,
      branchPurchasePriceKgs: 12000,
      totalAmount: 59999.99,
    });
    assert.equal(total, 59999.99);
  });

  it('sums line totals for order total', () => {
    const total = requestOrderTotal(
      [
        { quantity: 2, branchPurchasePriceKgs: 1000, totalAmount: 0 },
        { quantity: 1, branchPurchasePriceKgs: 500, totalAmount: 0 },
      ],
      0,
    );
    assert.equal(total, 2500);
  });

  it('uses resolved branch price before wholesale fallback', () => {
    assert.equal(
      getFrozenBranchPrice({
        quantity: 1,
        resolvedBranchPriceKgs: 12000,
        wholesalePriceKgs: 8000,
        branchPurchasePriceKgs: 7000,
      }),
      12000,
    );
  });
});

describe('branch purchase request display util smoke', () => {
  it('exports format helper', async () => {
    const mod = await import('./branch-purchase-request-display.util');
    assert.equal(typeof mod.formatFrozenBranchPrice, 'function');
    assert.equal(
      mod.formatFrozenBranchPrice({ quantity: 1, branchPurchasePriceKgs: 10 }, t),
      '10.00',
    );
  });
});
