import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  assertBranchPurchaseRequestTotalParity,
  repairBranchPurchaseRequestDerivedTotalsInTx,
} from './branch-purchase-totals-repair.util';
import { sanitizeBranchPurchaseRequest, toBranchPurchaseRequestResponse } from './branch-purchase-request.presenter';
import {
  assertBranchPurchaseAuthoritativeTotalUnchanged,
  computeBranchPurchaseHqReviewLineAmountKgs,
} from './branch-purchase-review-totals.util';

/** BPR-1786450868586 commercial snapshot pattern */
const AUTHORITATIVE_COMMERCIAL_TOTAL = 72490.5;
const WRONG_FIFO_TOTAL = 72823.21;
const DISPLAY_UNIT = 36245.25;
const EFFECTIVE_QTY = 2;

function buildHqBranchReviewedOrder(overrides?: {
  totalEstimatedAmount?: number;
  lineTotalAmount?: number;
  approvedLineTotalKgs?: number | null;
  status?: BranchPurchaseRequestStatus;
}) {
  return {
    id: 'bpr-1786450868586',
    requestNumber: 'BPR-1786450868586',
    status: overrides?.status ?? BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
    reviewedAt: new Date(),
    totalEstimatedAmount: overrides?.totalEstimatedAmount ?? WRONG_FIFO_TOTAL,
    transportCostKgs: 0,
    branch: { branchType: 'HQ_BRANCH', name: 'Test HQ Branch', code: 'HQB' },
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
        estimatedLineProductCostKgs: WRONG_FIFO_TOTAL,
        resolvedBranchPriceKgs: DISPLAY_UNIT,
        wholesalePriceKgs: DISPLAY_UNIT,
        totalAmount: overrides?.lineTotalAmount ?? WRONG_FIFO_TOTAL,
        approvedLineTotalKgs:
          overrides?.approvedLineTotalKgs === undefined
            ? WRONG_FIFO_TOTAL
            : overrides.approvedLineTotalKgs,
        hasPricingPolicyAtSubmit: true,
        hasPricingPolicyAtReview: true,
      },
    ],
  };
}

describe('BPR-1786450868586 order total parity (FIFO snapshot authoritative)', () => {
  it('explains 332.71 as unit×qty reconstruction minus FIFO snapshot', () => {
    const unitTimesQty = roundDisplayMoney(DISPLAY_UNIT * EFFECTIVE_QTY);
    assert.equal(unitTimesQty, AUTHORITATIVE_COMMERCIAL_TOTAL);
    assert.equal(roundDisplayMoney(WRONG_FIFO_TOTAL - unitTimesQty), 332.71);
  });

  it('product-level reconciliation: HQ Branch line is FIFO 72823.21', () => {
    const expectedLine = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: EFFECTIVE_QTY,
      approvedQuantity: EFFECTIVE_QTY,
      lineStatus: 'APPROVED',
      resolvedBranchPriceKgs: DISPLAY_UNIT,
      estimatedLineProductCostKgs: WRONG_FIFO_TOTAL,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(expectedLine, WRONG_FIFO_TOTAL);
    assert.notEqual(expectedLine, AUTHORITATIVE_COMMERCIAL_TOTAL);
  });

  it('HQ Sales / Branch Sales / line sum all equal FIFO 72823.21 after review', () => {
    const request = buildHqBranchReviewedOrder({
      totalEstimatedAmount: WRONG_FIFO_TOTAL,
      lineTotalAmount: WRONG_FIFO_TOTAL,
      approvedLineTotalKgs: WRONG_FIFO_TOTAL,
    });
    const parity = assertBranchPurchaseRequestTotalParity(request);
    assert.equal(parity.hqSalesTotalKgs, WRONG_FIFO_TOTAL);
    assert.equal(parity.branchManagerTotalKgs, WRONG_FIFO_TOTAL);
    assert.equal(parity.lineSumKgs, WRONG_FIFO_TOTAL);
  });

  it('presenter does not replace FIFO snapshot with unit×qty reconstruction', () => {
    const request = buildHqBranchReviewedOrder({
      totalEstimatedAmount: WRONG_FIFO_TOTAL,
      lineTotalAmount: WRONG_FIFO_TOTAL,
      approvedLineTotalKgs: WRONG_FIFO_TOTAL,
    });
    const full = toBranchPurchaseRequestResponse(request);
    const sanitized = sanitizeBranchPurchaseRequest(request, true);
    assert.equal(full.totalEstimatedAmount, WRONG_FIFO_TOTAL);
    assert.equal(sanitized.totalEstimatedAmount, WRONG_FIFO_TOTAL);
    assert.equal((full.items[0] as { totalAmount?: number }).totalAmount, WRONG_FIFO_TOTAL);
    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, WRONG_FIFO_TOTAL);
  });

  it('Branch Accountant API total uses same persisted authoritative header after repair', async () => {
    const request = buildHqBranchReviewedOrder({
      status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      totalEstimatedAmount: WRONG_FIFO_TOTAL,
      lineTotalAmount: WRONG_FIFO_TOTAL,
      approvedLineTotalKgs: WRONG_FIFO_TOTAL,
    });
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
          const item = request.items.find((row) => row.id === args.where.id);
          if (item) {
            item.totalAmount = args.data.totalAmount;
            item.approvedLineTotalKgs = args.data.approvedLineTotalKgs;
          }
        },
      },
    };

    const result = await repairBranchPurchaseRequestDerivedTotalsInTx(tx, request.id);
    assert.equal(result.previousOrderTotalKgs, WRONG_FIFO_TOTAL);
    assert.equal(result.repairedOrderTotalKgs, WRONG_FIFO_TOTAL);
    assert.equal(Number(request.totalEstimatedAmount), WRONG_FIFO_TOTAL);
    assert.equal(Number(request.items[0]?.totalAmount), WRONG_FIFO_TOTAL);

    const branchAccountantApiTotal = Number(request.totalEstimatedAmount);
    assert.equal(branchAccountantApiTotal, WRONG_FIFO_TOTAL);

    const reopened = toBranchPurchaseRequestResponse(request);
    assert.equal(reopened.totalEstimatedAmount, WRONG_FIFO_TOTAL);
    const invariant = assertBranchPurchaseAuthoritativeTotalUnchanged(
      WRONG_FIFO_TOTAL,
      Number(reopened.totalEstimatedAmount),
    );
    assert.equal(invariant.ok, true);
  });

  it('lifecycle status transition alone does not change money', () => {
    const before = WRONG_FIFO_TOTAL;
    const afterSameQuantities = WRONG_FIFO_TOTAL;
    const invariant = assertBranchPurchaseAuthoritativeTotalUnchanged(before, afterSameQuantities);
    assert.equal(invariant.ok, true);
    assert.equal(invariant.differenceKgs, 0);

    const drifted = assertBranchPurchaseAuthoritativeTotalUnchanged(before, AUTHORITATIVE_COMMERCIAL_TOTAL);
    assert.equal(drifted.ok, false);
    assert.equal(drifted.differenceKgs, -332.71);
  });

  it('partial approval uses remainder-safe FIFO share, not unit × qty', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 5,
      approvedQuantity: 2,
      lineStatus: 'PARTIALLY_APPROVED',
      resolvedBranchPriceKgs: 1963.59,
      totalAmount: 9817.95,
      estimatedLineProductCostKgs: 9000,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(lineTotal, 3600);
    assert.notEqual(lineTotal, 3927.18);
  });

  it('rejected item contributes 0 at every downstream stage', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 2,
      approvedQuantity: 0,
      lineStatus: 'REJECTED',
      resolvedBranchPriceKgs: DISPLAY_UNIT,
      estimatedLineProductCostKgs: WRONG_FIFO_TOTAL,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(lineTotal, 0);
  });
});
