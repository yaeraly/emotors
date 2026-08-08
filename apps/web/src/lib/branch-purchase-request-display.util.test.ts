import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  draftFormLineTotal,
  draftFormOrderTotal,
  getDisplayQuantity,
  getDraftFormBranchPrice,
  getFrozenBranchPrice,
  requestLineTotal,
  requestOrderTotal,
} from './branch-purchase-request-display.util';
import { roundMoney } from './money';

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

describe('branch purchase request draft form totals', () => {
  it('calculates draft line total as quantity times branch price', () => {
    assert.equal(
      draftFormLineTotal({
        productId: 'p1',
        quantity: '4',
        branchPurchasePriceKgs: 15000,
      }),
      60000,
    );
  });

  it('updates draft line total when quantity changes', () => {
    assert.equal(
      draftFormLineTotal({
        productId: 'p1',
        quantity: '5',
        branchPurchasePriceKgs: 15000,
      }),
      75000,
    );
  });

  it('does not stay zero when draft totalAmount was missing but branch price exists', () => {
    assert.equal(
      draftFormLineTotal({
        productId: 'p1',
        quantity: '3',
        branchPurchasePriceKgs: 4500,
      }),
      13500,
    );
  });

  it('returns zero while branch price is still resolving', () => {
    assert.equal(
      draftFormLineTotal({
        productId: 'p1',
        quantity: '2',
        branchPurchasePriceKgs: 12000,
        priceResolving: true,
      }),
      0,
    );
  });

  it('uses branchPurchasePriceKgs as the calculation source', () => {
    assert.equal(getDraftFormBranchPrice({ productId: 'p1', branchPurchasePriceKgs: 15000 }), 15000);
  });

  it('sums draft form rows for bottom total', () => {
    assert.equal(
      draftFormOrderTotal([
        { productId: 'p1', quantity: '4', branchPurchasePriceKgs: 15000 },
        { productId: 'p2', quantity: '1', branchPurchasePriceKgs: 25000 },
        { productId: 'p3', quantity: '3', branchPurchasePriceKgs: 5000 },
      ]),
      100000,
    );
  });

  it('prefers authoritative backend line total over unit×qty for HQ at-cost', () => {
    const line = { quantity: 11, totalCostKgs: 162317.33, unit: 14756.12 };
    const roundedUnitTotal = roundMoney(line.unit * line.quantity);
    assert.notEqual(roundedUnitTotal, line.totalCostKgs);
    assert.equal(
      draftFormLineTotal({
        productId: 'p1',
        quantity: String(line.quantity),
        branchPurchasePriceKgs: line.unit,
        authoritativeLineTotalKgs: line.totalCostKgs,
      }),
      line.totalCostKgs,
    );
    assert.equal(
      draftFormLineTotal({
        productId: 'p1',
        quantity: String(line.quantity),
        branchPurchasePriceKgs: line.unit,
        authoritativeLineTotalKgs: null,
      }),
      roundedUnitTotal,
    );
  });

  it('order total uses authoritative FIFO lines so 914369.08 unit×qty drift is avoided', () => {
    const driftedUnitLine = roundMoney(14756.12 * 11);
    assert.equal(
      draftFormOrderTotal([
        {
          productId: 'p1',
          quantity: '11',
          branchPurchasePriceKgs: 14756.12,
          authoritativeLineTotalKgs: 162317.33,
        },
        {
          productId: 'p2',
          quantity: '11',
          branchPurchasePriceKgs: 14756.12,
          authoritativeLineTotalKgs: 162317.33,
        },
      ]),
      roundMoney(162317.33 + 162317.33),
    );
    assert.notEqual(driftedUnitLine, 162317.33);
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
