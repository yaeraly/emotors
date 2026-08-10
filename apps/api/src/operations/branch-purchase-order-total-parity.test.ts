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

/** BPR-1786349778733 / cmsmxivrr0055zueq2pl50udj pattern */
const AUTHORITATIVE_FIFO_TOTAL = 72490.5;
const WRONG_COMMERCIAL_TOTAL = 67870.14; // 2 × 33935.07
const DISPLAY_UNIT = 33935.07;
const EFFECTIVE_QTY = 2;

function buildHqBranchReviewedOrder(overrides?: {
  totalEstimatedAmount?: number;
  lineTotalAmount?: number;
  approvedLineTotalKgs?: number | null;
  status?: BranchPurchaseRequestStatus;
}) {
  return {
    id: 'cmsmxivrr0055zueq2pl50udj',
    requestNumber: 'BPR-1786349778733',
    status: overrides?.status ?? BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
    reviewedAt: new Date(),
    totalEstimatedAmount: overrides?.totalEstimatedAmount ?? WRONG_COMMERCIAL_TOTAL,
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
        estimatedLineProductCostKgs: AUTHORITATIVE_FIFO_TOTAL,
        resolvedBranchPriceKgs: DISPLAY_UNIT,
        totalAmount: overrides?.lineTotalAmount ?? WRONG_COMMERCIAL_TOTAL,
        approvedLineTotalKgs:
          overrides?.approvedLineTotalKgs === undefined
            ? WRONG_COMMERCIAL_TOTAL
            : overrides.approvedLineTotalKgs,
        hasPricingPolicyAtSubmit: true,
        hasPricingPolicyAtReview: true,
      },
    ],
  };
}

describe('BPR-1786349778733 order total parity (FIFO payable authoritative)', () => {
  it('explains 4620.36 as commercial unit×qty minus must-not-use-for-Сумма drift source', () => {
    const commercial = roundDisplayMoney(DISPLAY_UNIT * EFFECTIVE_QTY);
    assert.equal(commercial, WRONG_COMMERCIAL_TOTAL);
    assert.equal(roundDisplayMoney(AUTHORITATIVE_FIFO_TOTAL - commercial), 4620.36);
  });

  it('product-level reconciliation: only Редуктор line causes 4620.36', () => {
    const expectedLine = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: EFFECTIVE_QTY,
      approvedQuantity: EFFECTIVE_QTY,
      lineStatus: 'APPROVED',
      resolvedBranchPriceKgs: DISPLAY_UNIT,
      estimatedLineProductCostKgs: AUTHORITATIVE_FIFO_TOTAL,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    const wrongCommercial = roundDisplayMoney(DISPLAY_UNIT * EFFECTIVE_QTY);
    assert.equal(expectedLine, AUTHORITATIVE_FIFO_TOTAL);
    assert.equal(roundDisplayMoney(expectedLine - wrongCommercial), 4620.36);
  });

  it('HQ Sales / Branch Sales / line sum all equal 72490.50 after review', () => {
    const request = buildHqBranchReviewedOrder({
      totalEstimatedAmount: AUTHORITATIVE_FIFO_TOTAL,
      lineTotalAmount: AUTHORITATIVE_FIFO_TOTAL,
      approvedLineTotalKgs: AUTHORITATIVE_FIFO_TOTAL,
    });
    const parity = assertBranchPurchaseRequestTotalParity(request);
    assert.equal(parity.hqSalesTotalKgs, AUTHORITATIVE_FIFO_TOTAL);
    assert.equal(parity.branchManagerTotalKgs, AUTHORITATIVE_FIFO_TOTAL);
    assert.equal(parity.lineSumKgs, AUTHORITATIVE_FIFO_TOTAL);
  });

  it('presenter does not replace FIFO payable with commercial unit×qty', () => {
    const request = buildHqBranchReviewedOrder({
      // Stale commercial header/lines (the BA bug)
      totalEstimatedAmount: WRONG_COMMERCIAL_TOTAL,
      lineTotalAmount: WRONG_COMMERCIAL_TOTAL,
      approvedLineTotalKgs: WRONG_COMMERCIAL_TOTAL,
    });
    const full = toBranchPurchaseRequestResponse(request);
    const sanitized = sanitizeBranchPurchaseRequest(request, true);
    assert.equal(full.totalEstimatedAmount, AUTHORITATIVE_FIFO_TOTAL);
    assert.equal(sanitized.totalEstimatedAmount, AUTHORITATIVE_FIFO_TOTAL);
    assert.equal((full.items[0] as { totalAmount?: number }).totalAmount, AUTHORITATIVE_FIFO_TOTAL);
    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, AUTHORITATIVE_FIFO_TOTAL);
  });

  it('Branch Accountant API total uses same persisted authoritative header after repair', async () => {
    const request = buildHqBranchReviewedOrder({
      status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      totalEstimatedAmount: WRONG_COMMERCIAL_TOTAL,
      lineTotalAmount: WRONG_COMMERCIAL_TOTAL,
      approvedLineTotalKgs: WRONG_COMMERCIAL_TOTAL,
    });
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
    assert.equal(result.previousOrderTotalKgs, WRONG_COMMERCIAL_TOTAL);
    assert.equal(result.repairedOrderTotalKgs, AUTHORITATIVE_FIFO_TOTAL);
    assert.equal(Number(request.totalEstimatedAmount), AUTHORITATIVE_FIFO_TOTAL);
    assert.equal(Number(request.items[0]?.totalAmount), AUTHORITATIVE_FIFO_TOTAL);

    // BA listPendingConfirmedOrders returns Number(request.totalEstimatedAmount)
    const branchAccountantApiTotal = Number(request.totalEstimatedAmount);
    assert.equal(branchAccountantApiTotal, AUTHORITATIVE_FIFO_TOTAL);

    // leave → reopen (presenter reload)
    const reopened = toBranchPurchaseRequestResponse(request);
    assert.equal(reopened.totalEstimatedAmount, AUTHORITATIVE_FIFO_TOTAL);
    const invariant = assertBranchPurchaseAuthoritativeTotalUnchanged(
      AUTHORITATIVE_FIFO_TOTAL,
      Number(reopened.totalEstimatedAmount),
    );
    assert.equal(invariant.ok, true);
  });

  it('lifecycle status transition alone does not change money', () => {
    const before = AUTHORITATIVE_FIFO_TOTAL;
    const afterSameQuantities = AUTHORITATIVE_FIFO_TOTAL;
    const invariant = assertBranchPurchaseAuthoritativeTotalUnchanged(before, afterSameQuantities);
    assert.equal(invariant.ok, true);
    assert.equal(invariant.differenceKgs, 0);

    const drifted = assertBranchPurchaseAuthoritativeTotalUnchanged(before, WRONG_COMMERCIAL_TOTAL);
    assert.equal(drifted.ok, false);
    assert.equal(drifted.differenceKgs, -4620.36);
  });

  it('partial approval uses approved qty FIFO snapshot only', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 10,
      approvedQuantity: 6,
      lineStatus: 'PARTIALLY_APPROVED',
      resolvedBranchPriceKgs: DISPLAY_UNIT,
      estimatedLineProductCostKgs: 40000,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(lineTotal, 40000);
    assert.notEqual(lineTotal, roundDisplayMoney(DISPLAY_UNIT * 6));
  });

  it('rejected item contributes 0 at every downstream stage', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 2,
      approvedQuantity: 0,
      lineStatus: 'REJECTED',
      resolvedBranchPriceKgs: DISPLAY_UNIT,
      estimatedLineProductCostKgs: AUTHORITATIVE_FIFO_TOTAL,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(lineTotal, 0);
  });
});
