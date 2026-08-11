import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  branchOrderLineTotal,
  branchOrderTotal,
  branchSalesManagerReviewLineRowClass,
  draftFormLineTotal,
  draftFormOrderTotal,
  getDisplayQuantity,
  getDraftFormBranchPrice,
  getFrozenBranchPrice,
  hqReviewLineAmount,
  hqReviewOrderAmount,
  hqReviewPreviewLineAmount,
  hqReviewPreviewOrderAmount,
  isPartiallyApprovedBranchPurchaseLine,
  requestLineTotal,
  requestOrderTotal,
  sumBranchPurchaseApprovedQuantity,
  sumBranchPurchaseRequestedQuantity,
} from './branch-purchase-request-display.util';
import { roundMoney } from './money';

const t = (key: string) => key;

describe('branch purchase request display totals', () => {
  it('uses display quantity times branch price for pending HQ review', () => {
    const total = requestLineTotal(
      {
        quantity: 5,
        branchPurchasePriceKgs: 12000,
        totalAmount: 0,
      },
      { requestStatus: 'SUBMITTED' },
    );
    assert.equal(total, 60000);
  });

  it('pending HQ review: prefers persisted authoritative totalAmount over commercial unit×qty', () => {
    const total = requestLineTotal(
      {
        quantity: 2,
        branchPurchasePriceKgs: 1963.59,
        totalAmount: 630.15,
      },
      { requestStatus: 'SUBMITTED_TO_HQ' },
    );
    assert.equal(total, 630.15);
    assert.notEqual(total, 3927.18);
  });

  it('pending HQ review create/list/detail parity for reducer FIFO line', () => {
    const line = {
      quantity: 2,
      branchPurchasePriceKgs: 1963.59,
      totalAmount: 630.15,
    };
    assert.equal(requestLineTotal(line, { requestStatus: 'SUBMITTED_TO_HQ' }), 630.15);
    assert.equal(
      requestOrderTotal([line], { requestStatus: 'SUBMITTED_TO_HQ' }),
      630.15,
    );
  });

  it('reviewed order prefers persisted FIFO payable over commercial unit×qty', () => {
    const line = {
      quantity: 2,
      approvedQuantity: 2,
      branchPurchasePriceKgs: 33935.07,
      totalAmount: 72490.5,
      approvedLineTotalKgs: 72490.5,
      lineStatus: 'APPROVED',
    };
    const commercial = roundMoney(line.branchPurchasePriceKgs * line.approvedQuantity);
    assert.equal(commercial, 67870.14);
    assert.equal(
      branchOrderLineTotal(line, { requestStatus: 'PENDING_BRANCH_CONFIRMATION', reviewed: true }),
      72490.5,
    );
    assert.equal(hqReviewLineAmount(line), 72490.5);
    assert.notEqual(hqReviewLineAmount(line), 67870.14);
  });

  it('reviewed HQ Sales and Branch Manager order totals match FIFO payable 72490.50', () => {
    const items = [
      {
        quantity: 2,
        approvedQuantity: 2,
        branchPurchasePriceKgs: 33935.07,
        totalAmount: 72490.5,
        approvedLineTotalKgs: 72490.5,
        lineStatus: 'APPROVED',
      },
    ];
    const options = {
      requestStatus: 'PENDING_BRANCH_CONFIRMATION',
      reviewed: true,
      totalEstimatedAmount: 72490.5,
    };
    assert.equal(hqReviewOrderAmount(items), 72490.5);
    assert.equal(branchOrderTotal(items, options), 72490.5);
    assert.equal(branchOrderLineTotal(items[0]!, options), 72490.5);
  });

  it('reviewed line total prefers persisted FIFO totalAmount over commercial unit×qty', () => {
    assert.equal(
      branchOrderLineTotal(
        {
          quantity: 2,
          approvedQuantity: 2,
          branchPurchasePriceKgs: 33935.07,
          totalAmount: 72490.5,
          approvedLineTotalKgs: 72490.5,
          lineStatus: 'APPROVED',
        },
        { requestStatus: 'PENDING_BRANCH_CONFIRMATION', reviewed: true },
      ),
      72490.5,
    );
  });

  it('does not silently stay zero when branch price exists but totalAmount is zero', () => {
    const total = requestLineTotal(
      {
        quantity: 3,
        branchPurchasePriceKgs: 4500,
        totalAmount: 0,
      },
      { requestStatus: 'SUBMITTED' },
    );
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
    const total = requestLineTotal(
      {
        quantity: 5,
        branchPurchasePriceKgs: 12000,
        totalAmount: 0,
      },
      { requestStatus: 'SUBMITTED' },
    );
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

  it('uses display quantity for pending HQ review line total', () => {
    assert.equal(getDisplayQuantity({ quantity: 5 }), 5);
    assert.equal(
      requestLineTotal(
        {
          quantity: 5,
          branchPurchasePriceKgs: 12000,
        },
        { requestStatus: 'SUBMITTED' },
      ),
      60000,
    );
  });

  it('sums pending HQ review line totals for order total', () => {
    const total = requestOrderTotal(
      [
        { quantity: 2, branchPurchasePriceKgs: 1000, totalAmount: 0 },
        { quantity: 1, branchPurchasePriceKgs: 500, totalAmount: 0 },
      ],
      { requestStatus: 'SUBMITTED' },
    );
    assert.equal(total, 2500);
  });

  it('order total ignores stale header totalEstimatedAmount and sums rows before review', () => {
    const total = requestOrderTotal(
      [
        { quantity: 5, branchPurchasePriceKgs: 12000, totalAmount: 0 },
        { quantity: 2, branchPurchasePriceKgs: 12500, totalAmount: 0 },
      ],
      { requestStatus: 'SUBMITTED' },
    );
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

  it('live Утв. draft updates row amount immediately (2 × 1963.59 = 3927.18)', () => {
    const item = {
      id: 'line-a',
      quantity: 10,
      branchPurchasePriceKgs: 1963.59,
      totalAmount: 19635.9,
      lineStatus: 'PENDING_REVIEW',
    };
    assert.equal(
      hqReviewPreviewLineAmount(item, { draftApprovedQuantity: 2, decisionAction: 'APPROVE' }),
      3927.18,
    );
    assert.equal(
      hqReviewPreviewLineAmount(item, { draftApprovedQuantity: 5, decisionAction: 'APPROVE' }),
      9817.95,
    );
  });

  it('live Утв. draft updates order total as sum of row previews', () => {
    const items = [
      {
        id: 'line-a',
        quantity: 10,
        branchPurchasePriceKgs: 1963.59,
        totalAmount: 19635.9,
        lineStatus: 'PENDING_REVIEW',
      },
      {
        id: 'line-b',
        quantity: 3,
        branchPurchasePriceKgs: 1000,
        totalAmount: 3000,
        lineStatus: 'PENDING_REVIEW',
      },
    ];
    const draftByItemId = {
      'line-a': { draftApprovedQuantity: 2 as const, decisionAction: 'APPROVE' },
      'line-b': { draftApprovedQuantity: 3 as const, decisionAction: 'APPROVE' },
    };
    const orderTotal = hqReviewPreviewOrderAmount(items, draftByItemId);
    const rowSum = roundMoney(
      hqReviewPreviewLineAmount(items[0]!, draftByItemId['line-a']) +
        hqReviewPreviewLineAmount(items[1]!, draftByItemId['line-b']),
    );
    assert.equal(orderTotal, rowSum);
    assert.equal(orderTotal, 6927.18);
  });

  it('empty Утв. draft does not force zero — falls back to requested/persisted preview', () => {
    const pending = {
      id: 'line-a',
      quantity: 10,
      branchPurchasePriceKgs: 1963.59,
      totalAmount: 19635.9,
      lineStatus: 'PENDING_REVIEW',
    };
    assert.equal(
      hqReviewPreviewLineAmount(pending, { draftApprovedQuantity: '', decisionAction: 'APPROVE' }),
      hqReviewLineAmount(pending),
    );
    assert.equal(
      hqReviewPreviewLineAmount(pending, { draftApprovedQuantity: '', decisionAction: 'APPROVE' }),
      19635.9,
    );
  });

  it('local REJECT draft previews zero before refetch; persisted reject stays zero', () => {
    const pending = {
      id: 'line-a',
      quantity: 10,
      branchPurchasePriceKgs: 1963.59,
      totalAmount: 19635.9,
      lineStatus: 'PENDING_REVIEW',
    };
    assert.equal(
      hqReviewPreviewLineAmount(pending, { draftApprovedQuantity: '', decisionAction: 'REJECT' }),
      0,
    );
    assert.equal(
      hqReviewPreviewLineAmount(
        { ...pending, lineStatus: 'REJECTED', approvedQuantity: 0, totalAmount: 0 },
        { draftApprovedQuantity: '', decisionAction: 'REJECT' },
      ),
      0,
    );
  });

  it('after save, draft matching persisted approved qty keeps FIFO payable total', () => {
    const reviewed = {
      id: 'line-a',
      quantity: 2,
      approvedQuantity: 2,
      branchPurchasePriceKgs: 33935.07,
      totalAmount: 72490.5,
      approvedLineTotalKgs: 72490.5,
      lineStatus: 'APPROVED',
    };
    assert.equal(
      hqReviewPreviewLineAmount(reviewed, { draftApprovedQuantity: 2, decisionAction: 'APPROVE' }),
      72490.5,
    );
  });

  it('approved reducer line persists FIFO 630.15 not commercial 2 × 1963.59', () => {
    const line = {
      quantity: 10,
      approvedQuantity: 2,
      branchPurchasePriceKgs: 1963.59,
      totalAmount: 630.15,
      approvedLineTotalKgs: 630.15,
      lineStatus: 'APPROVED',
    };
    assert.equal(hqReviewLineAmount(line), 630.15);
    assert.equal(
      branchOrderLineTotal(line, { requestStatus: 'PENDING_BRANCH_CONFIRMATION', reviewed: true }),
      630.15,
    );
    assert.notEqual(hqReviewLineAmount(line), 3927.18);
  });

  it('multiple rows calculate independently before HQ review', () => {
    assert.equal(
      requestOrderTotal(
        [
          { quantity: 5, branchPurchasePriceKgs: 12000 },
          { quantity: 1, branchPurchasePriceKgs: 25000 },
          { quantity: 3, branchPurchasePriceKgs: 5000 },
        ],
        { requestStatus: 'SUBMITTED' },
      ),
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

  it('keeps known branch price while a background refresh is resolving', () => {
    assert.equal(
      draftFormLineTotal({
        productId: 'p1',
        quantity: '2',
        branchPurchasePriceKgs: 12000,
        priceResolving: true,
      }),
      24000,
    );
  });

  it('Желмаян Контроллер: 25 × 2466.47 = 61661.75 (not FIFO 51795.79)', () => {
    assert.equal(
      draftFormLineTotal({
        productId: 'ctrl-70h',
        quantity: '25',
        branchPurchasePriceKgs: 2466.47,
        // Hidden FIFO/cost total must NOT replace displayed branch-price × qty.
        authoritativeLineTotalKgs: 51795.79,
      }),
      61661.75,
    );
    assert.notEqual(
      draftFormLineTotal({
        productId: 'ctrl-70h',
        quantity: '25',
        branchPurchasePriceKgs: 2466.47,
        authoritativeLineTotalKgs: 51795.79,
      }),
      51795.79,
    );
  });

  it('Редуктор regression: 2 × 1963.59 = 3927.18', () => {
    assert.equal(
      draftFormLineTotal({
        productId: 'reducer',
        quantity: '2',
        branchPurchasePriceKgs: 1963.59,
        authoritativeLineTotalKgs: 630.15,
      }),
      3927.18,
    );
  });

  it('updates create-form line total immediately when quantity changes', () => {
    const price = 2466.47;
    assert.equal(
      draftFormLineTotal({ productId: 'p1', quantity: '1', branchPurchasePriceKgs: price }),
      2466.47,
    );
    assert.equal(
      draftFormLineTotal({ productId: 'p1', quantity: '2', branchPurchasePriceKgs: price }),
      4932.94,
    );
    assert.equal(
      draftFormLineTotal({ productId: 'p1', quantity: '10', branchPurchasePriceKgs: price }),
      24664.7,
    );
    assert.equal(
      draftFormLineTotal({ productId: 'p1', quantity: '25', branchPurchasePriceKgs: price }),
      61661.75,
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

  it('order total equals SUM of displayed branch-price × qty rows', () => {
    assert.equal(
      draftFormOrderTotal([
        {
          productId: 'ctrl-70h',
          quantity: '25',
          branchPurchasePriceKgs: 2466.47,
          authoritativeLineTotalKgs: 51795.79,
        },
        {
          productId: 'reducer',
          quantity: '2',
          branchPurchasePriceKgs: 1963.59,
          authoritativeLineTotalKgs: 630.15,
        },
      ]),
      65588.93,
    );
  });

  it('DRAFT list/detail branchOrderTotal uses qty × branch price (72490.50 not stale 72823.21)', () => {
    const items = [
      {
        quantity: 2,
        branchPurchasePriceKgs: 36245.25,
        totalAmount: 72823.21,
      },
    ];
    assert.equal(
      branchOrderTotal(items, { requestStatus: 'DRAFT', totalEstimatedAmount: 72823.21 }),
      72490.5,
    );
    assert.notEqual(
      branchOrderTotal(items, { requestStatus: 'DRAFT', totalEstimatedAmount: 72823.21 }),
      72823.21,
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

describe('branch sales manager review quantity summary and row styling', () => {
  it('sums requested and approved unit quantities separately from position counts', () => {
    const items = [
      { quantity: 10, approvedQuantity: 10, lineStatus: 'APPROVED' },
      { quantity: 10, approvedQuantity: 6, lineStatus: 'PARTIALLY_APPROVED' },
      { quantity: 5, approvedQuantity: 0, lineStatus: 'REJECTED' },
    ];
    assert.equal(sumBranchPurchaseRequestedQuantity(items), 25);
    assert.equal(sumBranchPurchaseApprovedQuantity(items), 16);
  });

  it('uses request.totalQuantity when provided for ordered units', () => {
    assert.equal(sumBranchPurchaseRequestedQuantity([{ quantity: 10 }], 120), 120);
  });

  it('detects partial approval by persisted quantities', () => {
    assert.equal(
      isPartiallyApprovedBranchPurchaseLine({
        quantity: 10,
        approvedQuantity: 6,
        lineStatus: 'PARTIALLY_APPROVED',
      }),
      true,
    );
    assert.equal(
      isPartiallyApprovedBranchPurchaseLine({
        quantity: 10,
        approvedQuantity: 10,
        lineStatus: 'APPROVED',
      }),
      false,
    );
    assert.equal(
      isPartiallyApprovedBranchPurchaseLine({
        quantity: 10,
        approvedQuantity: 0,
        lineStatus: 'REJECTED',
      }),
      false,
    );
  });

  it('applies amber for partial rows and red for rejected rows only', () => {
    assert.equal(
      branchSalesManagerReviewLineRowClass({
        quantity: 10,
        approvedQuantity: 10,
        lineStatus: 'APPROVED',
      }),
      '',
    );
    assert.equal(
      branchSalesManagerReviewLineRowClass({
        quantity: 10,
        approvedQuantity: 6,
        lineStatus: 'PARTIALLY_APPROVED',
      }),
      'bg-amber-50',
    );
    assert.equal(
      branchSalesManagerReviewLineRowClass({
        quantity: 10,
        approvedQuantity: 0,
        lineStatus: 'REJECTED',
      }),
      'bg-red-50',
    );
  });
});
