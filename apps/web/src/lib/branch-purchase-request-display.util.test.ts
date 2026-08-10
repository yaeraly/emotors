import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  draftFormLineTotal,
  draftFormOrderTotal,
  getDisplayQuantity,
  getDraftFormBranchPrice,
  getFrozenBranchPrice,
  hqReviewLineAmount,
  hqReviewOrderAmount,
  requestLineTotal,
  requestOrderTotal,
} from './branch-purchase-request-display.util';
import { roundMoney } from './money';

const t = (key: string) => key;

describe('branch purchase request display totals', () => {
  it('uses display quantity times branch price for line total', () => {
    const total = requestLineTotal({
      quantity: 5,
      branchPurchasePriceKgs: 12000,
      totalAmount: 0,
    });
    assert.equal(total, 60000);
  });

  it('pending HQ review: line total is quantity times branch price not FIFO cost', () => {
    const total = requestLineTotal({
      quantity: 2,
      branchPurchasePriceKgs: 1963.59,
      totalAmount: 630.15,
    });
    assert.equal(total, 3927.18);
    assert.notEqual(total, 630.15);
  });

  it('does not silently stay zero when branch price exists but totalAmount is zero', () => {
    const total = requestLineTotal({
      quantity: 3,
      branchPurchasePriceKgs: 4500,
      totalAmount: 0,
    });
    assert.equal(total, 13500);
  });

  it('falls back to backend totalAmount only when branch price is unavailable', () => {
    const total = requestLineTotal({
      quantity: 5,
      branchPurchasePriceKgs: undefined,
      resolvedBranchPriceKgs: null,
      totalAmount: 60000,
    });
    assert.equal(total, 60000);
  });

  it('falls back to qty × branch price only when totalAmount is missing/zero', () => {
    const total = requestLineTotal({
      quantity: 5,
      branchPurchasePriceKgs: 12000,
      totalAmount: 0,
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

  it('hq review line amount uses requested quantity before review', () => {
    assert.equal(
      hqReviewLineAmount({
        quantity: 10,
        branchPurchasePriceKgs: 5000,
        totalAmount: 0,
        lineStatus: 'PENDING_REVIEW',
      }),
      50000,
    );
  });

  it('hq review line amount uses latest approved quantity after review', () => {
    assert.equal(
      hqReviewLineAmount({
        quantity: 10,
        branchPurchasePriceKgs: 10000,
        totalAmount: 100000,
        lineStatus: 'APPROVED',
        approvedQuantity: 6,
        approvedLineTotalKgs: 60000,
      }),
      60000,
    );
  });

  it('hq review line amount is zero after rejection', () => {
    assert.equal(
      hqReviewLineAmount({
        quantity: 10,
        branchPurchasePriceKgs: 10000,
        totalAmount: 100000,
        lineStatus: 'REJECTED',
        approvedQuantity: 0,
      }),
      0,
    );
  });

  it('hq review order amount equals sum of displayed row amounts including unreviewed', () => {
    const items = [
      {
        quantity: 10,
        branchPurchasePriceKgs: 1000,
        totalAmount: 10000,
        lineStatus: 'PARTIALLY_APPROVED',
        approvedQuantity: 6,
        approvedLineTotalKgs: 6000,
      },
      {
        quantity: 5,
        branchPurchasePriceKgs: 2000,
        totalAmount: 10000,
        lineStatus: 'PENDING_REVIEW',
      },
      {
        quantity: 3,
        branchPurchasePriceKgs: 5000,
        totalAmount: 15000,
        lineStatus: 'PENDING_REVIEW',
      },
    ];
    const orderTotal = hqReviewOrderAmount(items);
    const rowSum = roundMoney(items.reduce((sum, item) => sum + hqReviewLineAmount(item), 0));
    assert.equal(orderTotal, rowSum);
    assert.equal(orderTotal, 31000);
  });

  it('hq review order total follows approve, change, and reject sequence', () => {
    const baseItems = [
      {
        quantity: 10,
        branchPurchasePriceKgs: 10000,
        totalAmount: 100000,
        lineStatus: 'APPROVED',
        approvedQuantity: 10,
        approvedLineTotalKgs: 100000,
      },
      {
        quantity: 5,
        branchPurchasePriceKgs: 10000,
        totalAmount: 50000,
        lineStatus: 'APPROVED',
        approvedQuantity: 5,
        approvedLineTotalKgs: 50000,
      },
      {
        quantity: 2,
        branchPurchasePriceKgs: 10000,
        totalAmount: 20000,
        lineStatus: 'APPROVED',
        approvedQuantity: 2,
        approvedLineTotalKgs: 20000,
      },
    ];
    assert.equal(hqReviewOrderAmount(baseItems), 170000);

    const afterChangeA = [
      { ...baseItems[0], lineStatus: 'PARTIALLY_APPROVED', approvedQuantity: 6, approvedLineTotalKgs: 60000, totalAmount: 60000 },
      baseItems[1],
      baseItems[2],
    ];
    assert.equal(hqReviewOrderAmount(afterChangeA), 130000);

    const afterRejectB = [
      afterChangeA[0],
      { ...baseItems[1], lineStatus: 'REJECTED', approvedQuantity: 0, approvedLineTotalKgs: 0, totalAmount: 0 },
      baseItems[2],
    ];
    assert.equal(hqReviewOrderAmount(afterRejectB), 80000);
  });

  it('hq review order amount includes unreviewed requested amounts after partial review', () => {
    assert.equal(
      hqReviewOrderAmount([
        {
          quantity: 10,
          branchPurchasePriceKgs: 1000,
          totalAmount: 10000,
          lineStatus: 'PARTIALLY_APPROVED',
          approvedQuantity: 6,
          approvedLineTotalKgs: 6000,
        },
        {
          quantity: 5,
          branchPurchasePriceKgs: 2000,
          totalAmount: 10000,
          lineStatus: 'PENDING_REVIEW',
        },
      ]),
      16000,
    );
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
