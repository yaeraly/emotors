import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import {
  assertBprMoneyNeutralTransition,
  calculateBprLineTotalKgs,
  calculateBprOrderTotalKgs,
  getBprEffectiveQuantity,
  getBprSavedOrderLineUnitPriceKgs,
  resolveBprMoneyStage,
} from './branch-purchase-authoritative-money.util';
import { sanitizeBranchPurchaseRequest, toBranchPurchaseRequestResponse } from './branch-purchase-request.presenter';
import { resolveBranchPurchaseApprovedInvoiceLine } from './branch-purchase-invoice-lines.util';

describe('BPR authoritative commercial money', () => {
  it('BPR-1786450868586: 2 × 36245.25 = 72490.50 (not live-cost 72823.21)', () => {
    const item = {
      quantity: 2,
      resolvedBranchPriceKgs: 36245.25,
      wholesalePriceKgs: 36245.25,
      estimatedLineProductCostKgs: 72823.21,
      totalAmount: 72823.21,
    };
    assert.equal(getBprSavedOrderLineUnitPriceKgs(item), 36245.25);
    assert.equal(calculateBprLineTotalKgs(item, 'draft'), 72490.5);
    assert.equal(calculateBprOrderTotalKgs([item], 'draft'), 72490.5);
    assert.notEqual(calculateBprOrderTotalKgs([item], 'draft'), 72823.21);
  });

  it('draft list/detail presenter both return 72490.50 from saved price', () => {
    const request = {
      status: BranchPurchaseRequestStatus.DRAFT,
      reviewedAt: null,
      totalEstimatedAmount: 72823.21,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: [
        {
          id: 'line-1',
          productId: 'p1',
          sku: 'S',
          productName: 'Редуктор',
          quantity: 2,
          unit: 'pcs',
          resolvedBranchPriceKgs: 36245.25,
          wholesalePriceKgs: 36245.25,
          estimatedLineProductCostKgs: 72823.21,
          totalAmount: 72823.21,
        },
      ],
    };
    const full = toBranchPurchaseRequestResponse(request);
    const sanitized = sanitizeBranchPurchaseRequest(request, true);
    assert.equal(full.totalEstimatedAmount, 72490.5);
    assert.equal(sanitized.totalEstimatedAmount, 72490.5);
    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, 72490.5);
  });

  it('submit without quantity change is money-neutral', () => {
    const draftTotal = calculateBprOrderTotalKgs(
      [{ quantity: 2, resolvedBranchPriceKgs: 36245.25, wholesalePriceKgs: 36245.25 }],
      'draft',
    );
    const submittedTotal = calculateBprOrderTotalKgs(
      [{ quantity: 2, resolvedBranchPriceKgs: 36245.25, wholesalePriceKgs: 36245.25 }],
      'pending_hq_review',
    );
    const neutral = assertBprMoneyNeutralTransition(draftTotal, submittedTotal);
    assert.equal(neutral.ok, true);
    assert.equal(neutral.differenceKgs, 0);
    assert.equal(submittedTotal, 72490.5);
  });

  it('HQ Sales unchanged quantities keep the same total', () => {
    const before = calculateBprOrderTotalKgs(
      [{ quantity: 2, resolvedBranchPriceKgs: 36245.25, lineStatus: 'PENDING_REVIEW' }],
      'pending_hq_review',
    );
    const after = calculateBprOrderTotalKgs(
      [
        {
          quantity: 2,
          approvedQuantity: 2,
          resolvedBranchPriceKgs: 36245.25,
          lineStatus: 'APPROVED',
          approvedLineTotalKgs: 72490.5,
          totalAmount: 72490.5,
        },
      ],
      'reviewed',
    );
    assert.equal(before, 72490.5);
    assert.equal(after, 72490.5);
    assert.equal(assertBprMoneyNeutralTransition(before, after).ok, true);
  });

  it('HQ Sales approved quantity change uses SAME saved unit price', () => {
    const item = {
      quantity: 5,
      approvedQuantity: 2,
      resolvedBranchPriceKgs: 1963.59,
      wholesalePriceKgs: 1963.59,
      lineStatus: 'PARTIALLY_APPROVED',
    };
    assert.equal(getBprEffectiveQuantity(item, 'reviewed'), 2);
    assert.equal(calculateBprLineTotalKgs(item, 'reviewed'), 3927.18);
  });

  it('later catalog/FIFO price changes do not affect saved BPR commercial total', () => {
    const saved = {
      quantity: 2,
      resolvedBranchPriceKgs: 36245.25,
      wholesalePriceKgs: 36245.25,
      estimatedLineProductCostKgs: 72823.21, // live FIFO drifted
      totalAmount: 72490.5,
    };
    assert.equal(calculateBprLineTotalKgs(saved, 'draft'), 72490.5);
    assert.equal(calculateBprLineTotalKgs({ ...saved, estimatedLineProductCostKgs: 99999 }, 'draft'), 72490.5);
  });

  it('Branch Accountant invoice line uses BPR commercial snapshot not FIFO', () => {
    const invoiceLine = resolveBranchPurchaseApprovedInvoiceLine({
      productId: 'p1',
      sku: 'S',
      productName: 'Редуктор',
      quantity: 2,
      approvedQuantity: 2,
      lineStatus: 'APPROVED',
      resolvedBranchPriceKgs: 36245.25,
      totalAmount: 72490.5,
      approvedLineTotalKgs: 72490.5,
      estimatedLineProductCostKgs: 72823.21,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(invoiceLine.quantity, 2);
    assert.equal(invoiceLine.unitPrice, 36245.25);
    assert.equal(invoiceLine.lineTotal, 72490.5);
    assert.notEqual(invoiceLine.lineTotal, 72823.21);
  });

  it('resolveBprMoneyStage maps lifecycle statuses', () => {
    assert.equal(resolveBprMoneyStage({ status: 'DRAFT' }), 'draft');
    assert.equal(resolveBprMoneyStage({ status: 'SUBMITTED_TO_HQ' }), 'pending_hq_review');
    assert.equal(
      resolveBprMoneyStage({ status: 'PENDING_BRANCH_CONFIRMATION', reviewedAt: new Date() }),
      'reviewed',
    );
  });

  it('all downstream roles share the same commercial total when qty/price unchanged', () => {
    const items = [
      {
        quantity: 2,
        approvedQuantity: 2,
        resolvedBranchPriceKgs: 36245.25,
        wholesalePriceKgs: 36245.25,
        lineStatus: 'APPROVED',
        approvedLineTotalKgs: 72490.5,
        totalAmount: 72490.5,
        estimatedLineProductCostKgs: 72823.21,
      },
    ];
    const stages = [
      'draft',
      'pending_hq_review',
      'reviewed',
    ] as const;
    // Draft/pending use requested qty; reviewed uses approved qty — same values here.
    for (const stage of stages) {
      assert.equal(calculateBprOrderTotalKgs(items, stage), 72490.5);
    }
    const roleStatuses = [
      'PENDING_BRANCH_CONFIRMATION',
      'BRANCH_CONFIRMED',
      'PENDING_PAYMENT',
      'PAYMENT_CONFIRMED',
      'SENT_TO_HQ_WAREHOUSE',
      'SHIPPED',
      'RECEIVED',
    ];
    for (const status of roleStatuses) {
      const stage = resolveBprMoneyStage({ status, reviewedAt: new Date() });
      assert.equal(calculateBprOrderTotalKgs(items, stage), 72490.5);
      assert.equal(
        assertBprMoneyNeutralTransition(72490.5, calculateBprOrderTotalKgs(items, stage)).ok,
        true,
      );
    }
  });

  it('decimal prices remain exact (1963.59 × 2 = 3927.18)', () => {
    assert.equal(
      calculateBprLineTotalKgs(
        {
          quantity: 2,
          approvedQuantity: 2,
          lineStatus: 'APPROVED',
          resolvedBranchPriceKgs: 1963.59,
        },
        'reviewed',
      ),
      3927.18,
    );
  });
});
