import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  assertBranchPurchaseRequestTotalParity,
  repairBranchPurchaseRequestDerivedTotalsInTx,
} from './branch-purchase-totals-repair.util';
import { sanitizeBranchPurchaseRequest, toBranchPurchaseRequestResponse } from './branch-purchase-request.presenter';

/** Stale DB pattern: FIFO line 72490.50 vs rounded display unit×qty 67870.14 (Δ 4620.36). */
const STALE_LINE_TOTAL = 67870.14;
const AUTHORITATIVE_FIFO_LINE = 72490.5;
const DISPLAY_UNIT = 33935.07;
const EFFECTIVE_QTY = 2;

function buildStaleHqBranchReviewedOrder() {
  return {
    id: 'cmsmxivrr0055zueq2pl50udj',
    requestNumber: 'BPR-STALE-PARITY',
    status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
    reviewedAt: new Date(),
    totalEstimatedAmount: STALE_LINE_TOTAL,
    transportCostKgs: 0,
    branch: { branchType: 'HQ_BRANCH' },
    items: [
      {
        id: 'line-reducer',
        productId: 'prod-reducer',
        sku: 'RED-18',
        productName: 'Редуктор 18 зуб 4.3 кг',
        quantity: EFFECTIVE_QTY,
        approvedQuantity: EFFECTIVE_QTY,
        lineStatus: 'APPROVED',
        unit: 'pcs',
        estimatedLineProductCostKgs: AUTHORITATIVE_FIFO_LINE,
        resolvedBranchPriceKgs: DISPLAY_UNIT,
        totalAmount: STALE_LINE_TOTAL,
        approvedLineTotalKgs: STALE_LINE_TOTAL,
        hasPricingPolicyAtSubmit: true,
      },
    ],
  };
}

describe('branch purchase order total parity (cmsmxivrr0055zueq2pl50udj pattern)', () => {
  it('SUBMITTED_TO_HQ list parity matches HQ Sales submitted total', () => {
    const request = {
      id: 'cmsmxivrr0055zueq2pl50udj',
      requestNumber: 'BPR-SUBMITTED-LIST',
      status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
      reviewedAt: null,
      totalEstimatedAmount: AUTHORITATIVE_FIFO_LINE,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: [
        {
          id: 'line-reducer',
          productId: 'prod-reducer',
          sku: 'RED-18',
          productName: 'Редуктор 18 зуб 4.3 кг',
          quantity: EFFECTIVE_QTY,
          unit: 'pcs',
          estimatedLineProductCostKgs: AUTHORITATIVE_FIFO_LINE,
          resolvedBranchPriceKgs: DISPLAY_UNIT,
          totalAmount: AUTHORITATIVE_FIFO_LINE,
          hasPricingPolicyAtSubmit: true,
        },
      ],
    };
    const parity = assertBranchPurchaseRequestTotalParity(request);
    assert.equal(parity.hqSalesTotalKgs, AUTHORITATIVE_FIFO_LINE);
    assert.equal(parity.branchManagerTotalKgs, AUTHORITATIVE_FIFO_LINE);
    assert.equal(parity.lineSumKgs, AUTHORITATIVE_FIFO_LINE);
    assert.notEqual(parity.branchManagerTotalKgs, STALE_LINE_TOTAL);
  });

  it('explains 4620.36 as rounded unit×qty minus authoritative FIFO line total', () => {
    const rounded = roundDisplayMoney(DISPLAY_UNIT * EFFECTIVE_QTY);
    assert.equal(rounded, STALE_LINE_TOTAL);
    assert.equal(roundDisplayMoney(AUTHORITATIVE_FIFO_LINE - rounded), 4620.36);
  });

  it('presenter aligns HQ Sales and Branch Manager totals after review', () => {
    const request = buildStaleHqBranchReviewedOrder();
    const parity = assertBranchPurchaseRequestTotalParity(request);

    assert.equal(parity.hqSalesTotalKgs, AUTHORITATIVE_FIFO_LINE);
    assert.equal(parity.branchManagerTotalKgs, AUTHORITATIVE_FIFO_LINE);
    assert.equal(parity.lineSumKgs, AUTHORITATIVE_FIFO_LINE);
    assert.notEqual(parity.hqSalesTotalKgs, STALE_LINE_TOTAL);
  });

  it('sanitized branch line total uses presenter FIFO not requested×display unit', () => {
    const sanitized = sanitizeBranchPurchaseRequest(buildStaleHqBranchReviewedOrder(), true);
    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, AUTHORITATIVE_FIFO_LINE);
    assert.equal(sanitized.totalEstimatedAmount, AUTHORITATIVE_FIFO_LINE);
  });

  it('full HQ Sales response uses same authoritative line total', () => {
    const full = toBranchPurchaseRequestResponse(buildStaleHqBranchReviewedOrder());
    assert.equal((full.items[0] as { totalAmount?: number }).totalAmount, AUTHORITATIVE_FIFO_LINE);
    assert.equal(full.totalEstimatedAmount, AUTHORITATIVE_FIFO_LINE);
  });

  it('repair persists authoritative totals from order-line snapshots', async () => {
    const request = buildStaleHqBranchReviewedOrder();
    const updates: Array<{ id: string; totalAmount: number; approvedLineTotalKgs: number | null }> = [];
    const tx = {
      branch: {
        findFirst: async () => ({ branchType: 'HQ_BRANCH' }),
      },
      branchPurchaseRequest: {
        findUnique: async () => request,
        update: async (args: { where: { id: string }; data: { totalEstimatedAmount: number } }) => {
          request.totalEstimatedAmount = args.data.totalEstimatedAmount;
          return request;
        },
      },
      branchPurchaseRequestItem: {
        findMany: async () => request.items,
        update: async (args: {
          where: { id: string };
          data: { totalAmount: number; approvedLineTotalKgs: number | null };
        }) => {
          updates.push({ id: args.where.id, ...args.data });
          const item = request.items.find((row) => row.id === args.where.id);
          if (item) {
            item.totalAmount = args.data.totalAmount;
            item.approvedLineTotalKgs = args.data.approvedLineTotalKgs;
          }
        },
      },
    };

    const result = await repairBranchPurchaseRequestDerivedTotalsInTx(tx, request.id);
    assert.equal(result.previousOrderTotalKgs, STALE_LINE_TOTAL);
    assert.equal(result.repairedOrderTotalKgs, AUTHORITATIVE_FIFO_LINE);
    assert.equal(result.lineRepairs.length, 1);
    assert.equal(result.lineRepairs[0]?.previousKgs, STALE_LINE_TOTAL);
    assert.equal(result.lineRepairs[0]?.repairedKgs, AUTHORITATIVE_FIFO_LINE);
    assert.equal(Number(request.totalEstimatedAmount), AUTHORITATIVE_FIFO_LINE);
    assert.equal(Number(request.items[0]?.totalAmount), AUTHORITATIVE_FIFO_LINE);
  });

  it('price snapshot on line is preserved — catalog repricing does not change order unit', () => {
    const request = buildStaleHqBranchReviewedOrder();
    const sanitized = sanitizeBranchPurchaseRequest(request, true);
    assert.equal(
      (sanitized.items[0] as { branchPurchasePriceKgs?: number }).branchPurchasePriceKgs,
      DISPLAY_UNIT,
    );
    assert.equal(
      (sanitized.items[0] as { resolvedBranchPriceKgs?: unknown }).resolvedBranchPriceKgs,
      undefined,
    );
  });
});
