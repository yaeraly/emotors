import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateServiceOrderTotals } from './service-order-totals.util';

describe('calculateServiceOrderTotals', () => {
  it('calculates work, product, and grand totals separately', () => {
    const totals = calculateServiceOrderTotals({
      workLines: [{ quantity: 1, unitPrice: 1000 }],
      productLines: [{ quantity: 1, unitPrice: 4500 }],
    });
    assert.equal(totals.workTotal, 1000);
    assert.equal(totals.productTotal, 4500);
    assert.equal(totals.grandTotal, 5500);
  });

  it('sums multiple lines with decimal-safe math', () => {
    const totals = calculateServiceOrderTotals({
      workLines: [
        { quantity: 2, unitPrice: 500.5 },
        { quantity: 1, unitPrice: 100 },
      ],
      productLines: [{ quantity: 3, unitPrice: 1500 }],
    });
    assert.equal(totals.workTotal, 1101);
    assert.equal(totals.productTotal, 4500);
    assert.equal(totals.grandTotal, 5601);
  });
});
