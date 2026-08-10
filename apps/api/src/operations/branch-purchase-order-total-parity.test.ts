import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  assertBranchPurchaseRequestTotalParity,
  repairBranchPurchaseRequestDerivedTotalsInTx,
} from './branch-purchase-totals-repair.util';
import { sanitizeBranchPurchaseRequest, toBranchPurchaseRequestResponse } from './branch-purchase-request.presenter';

/** Stale DB pattern: FIFO cost leaked into totals vs commercial qty × branch price. */
const COMMERCIAL_LINE_TOTAL = 67870.14; // 2 × 33935.07
const STALE_FIFO_LINE = 72490.5;
const DISPLAY_UNIT = 33935.07;
const EFFECTIVE_QTY = 2;

function buildStaleHqBranchReviewedOrder() {
  return {
    id: 'cmsmxivrr0055zueq2pl50udj',
    requestNumber: 'BPR-STALE-PARITY',
    status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
    reviewedAt: new Date(),
    totalEstimatedAmount: STALE_FIFO_LINE, // stale FIFO order total after wrong approve
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
        estimatedLineProductCostKgs: STALE_FIFO_LINE,
        resolvedBranchPriceKgs: DISPLAY_UNIT,
        totalAmount: STALE_FIFO_LINE, // stale FIFO line total
        approvedLineTotalKgs: STALE_FIFO_LINE,
        hasPricingPolicyAtSubmit: true,
      },
    ],
  };
}

describe('branch purchase order total parity (cmsmxivrr0055zueq2pl50udj pattern)', () => {
  it('SUBMITTED_TO_HQ create/list/detail use commercial qty × branch price', () => {
    const createFormTotal = COMMERCIAL_LINE_TOTAL; // 2 × 33935.07
    const request = {
      id: 'cmsmxivrr0055zueq2pl50udj',
      requestNumber: 'BPR-SUBMITTED-LIST',
      status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
      reviewedAt: null,
      totalEstimatedAmount: STALE_FIFO_LINE, // stale FIFO header after wrong submit
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: [
        {
          id: 'line-reducer',
          productId: 'prod-reducer',
          sku: 'RED-18',
          productName: 'Редуктор 23 зуб 5 кг',
          quantity: EFFECTIVE_QTY,
          unit: 'pcs',
          estimatedLineProductCostKgs: STALE_FIFO_LINE,
          resolvedBranchPriceKgs: DISPLAY_UNIT,
          totalAmount: STALE_FIFO_LINE, // stale FIFO line total
          hasPricingPolicyAtSubmit: true,
        },
      ],
    };
    const parity = assertBranchPurchaseRequestTotalParity(request);
    assert.equal(parity.hqSalesTotalKgs, createFormTotal);
    assert.equal(parity.branchManagerTotalKgs, createFormTotal);
    assert.equal(parity.lineSumKgs, createFormTotal);
    assert.notEqual(parity.branchManagerTotalKgs, STALE_FIFO_LINE);
  });

  it('explains 4620.36 as FIFO minus commercial unit×qty (FIFO must not be Сумма)', () => {
    const commercial = roundDisplayMoney(DISPLAY_UNIT * EFFECTIVE_QTY);
    assert.equal(commercial, COMMERCIAL_LINE_TOTAL);
    assert.equal(roundDisplayMoney(STALE_FIFO_LINE - commercial), 4620.36);
  });

  it('presenter aligns HQ Sales and Branch Manager totals after review (commercial)', () => {
    const request = buildStaleHqBranchReviewedOrder();
    const parity = assertBranchPurchaseRequestTotalParity(request);

    assert.equal(parity.hqSalesTotalKgs, COMMERCIAL_LINE_TOTAL);
    assert.equal(parity.branchManagerTotalKgs, COMMERCIAL_LINE_TOTAL);
    assert.equal(parity.lineSumKgs, COMMERCIAL_LINE_TOTAL);
    assert.notEqual(parity.hqSalesTotalKgs, STALE_FIFO_LINE);
  });

  it('sanitized branch line total uses commercial qty × branch price not FIFO', () => {
    const sanitized = sanitizeBranchPurchaseRequest(buildStaleHqBranchReviewedOrder(), true);
    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, COMMERCIAL_LINE_TOTAL);
    assert.equal(sanitized.totalEstimatedAmount, COMMERCIAL_LINE_TOTAL);
  });

  it('full HQ Sales response uses same authoritative commercial line total', () => {
    const full = toBranchPurchaseRequestResponse(buildStaleHqBranchReviewedOrder());
    assert.equal((full.items[0] as { totalAmount?: number }).totalAmount, COMMERCIAL_LINE_TOTAL);
    assert.equal(full.totalEstimatedAmount, COMMERCIAL_LINE_TOTAL);
  });

  it('repair persists commercial totals from order-line price snapshots', async () => {
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
    assert.equal(result.previousOrderTotalKgs, STALE_FIFO_LINE);
    assert.equal(result.repairedOrderTotalKgs, COMMERCIAL_LINE_TOTAL);
    assert.equal(result.lineRepairs.length, 1);
    assert.equal(result.lineRepairs[0]?.previousKgs, STALE_FIFO_LINE);
    assert.equal(result.lineRepairs[0]?.repairedKgs, COMMERCIAL_LINE_TOTAL);
    assert.equal(Number(request.totalEstimatedAmount), COMMERCIAL_LINE_TOTAL);
    assert.equal(Number(request.items[0]?.totalAmount), COMMERCIAL_LINE_TOTAL);
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
