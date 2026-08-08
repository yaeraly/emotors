import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDisplayQuantity,
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

  it('does not use stale totalAmount when it disagrees with displayed qty times price', () => {
    const total = requestLineTotal({
      quantity: 5,
      branchPurchasePriceKgs: 12000,
      totalAmount: 1,
    });
    assert.equal(total, 60000);
  });

  it('does not use wholesale price for branch display', () => {
    assert.equal(
      getFrozenBranchPrice({
        quantity: 1,
        branchPurchasePriceKgs: 12000,
        resolvedBranchPriceKgs: null,
        wholesalePriceKgs: 8000,
      }),
      12000,
    );
  });

  it('prefers branchPurchasePriceKgs over resolvedBranchPriceKgs', () => {
    assert.equal(
      getFrozenBranchPrice({
        quantity: 1,
        branchPurchasePriceKgs: 12000,
        resolvedBranchPriceKgs: 7000,
      }),
      12000,
    );
  });

  it('uses display quantity for line total', () => {
    assert.equal(getDisplayQuantity({ quantity: 5 }), 5);
    assert.equal(
      requestLineTotal({
        quantity: 5,
        branchPurchasePriceKgs: 12000,
      }),
      60000,
    );
  });

  it('sums line totals for order total', () => {
    const total = requestOrderTotal([
      { quantity: 2, branchPurchasePriceKgs: 1000, totalAmount: 0 },
      { quantity: 1, branchPurchasePriceKgs: 500, totalAmount: 0 },
    ]);
    assert.equal(total, 2500);
  });

  it('order total ignores stale header totalEstimatedAmount and sums rows', () => {
    const total = requestOrderTotal([
      { quantity: 5, branchPurchasePriceKgs: 12000, totalAmount: 0 },
      { quantity: 2, branchPurchasePriceKgs: 12500, totalAmount: 0 },
    ]);
    assert.equal(total, 85000);
  });

  it('multiple rows calculate independently', () => {
    assert.equal(
      requestOrderTotal([
        { quantity: 5, branchPurchasePriceKgs: 12000 },
        { quantity: 1, branchPurchasePriceKgs: 25000 },
        { quantity: 3, branchPurchasePriceKgs: 5000 },
      ]),
      100000,
    );
  });
});

describe('branch purchase request display util smoke', () => {
  it('exports format helpers', async () => {
    const mod = await import('./branch-purchase-request-display.util');
    assert.equal(typeof mod.formatFrozenBranchPrice, 'function');
    assert.equal(
      mod.formatFrozenBranchPrice({ quantity: 1, branchPurchasePriceKgs: 10 }, t),
      '10,00',
    );
    assert.equal(mod.formatLineTotalKgs({ quantity: 5, branchPurchasePriceKgs: 12000 }), '60\u00a0000,00');
    assert.equal(
      mod.formatOrderTotalKgs([
        { quantity: 5, branchPurchasePriceKgs: 12000 },
        { quantity: 1, branchPurchasePriceKgs: 25000 },
        { quantity: 3, branchPurchasePriceKgs: 5000 },
      ]),
      '100\u00a0000,00',
    );
  });
});
