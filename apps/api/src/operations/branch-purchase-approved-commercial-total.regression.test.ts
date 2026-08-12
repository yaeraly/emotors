import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestLineStatus, BranchPurchaseRequestStatus } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  computeBranchPurchaseHqReviewLineAmountKgs,
  sumBranchPurchaseHqReviewLineAmountsKgs,
} from './branch-purchase-review-totals.util';
import { repairBranchPurchaseRequestDerivedTotalsInTx } from './branch-purchase-totals-repair.util';
import {
  sanitizeBranchPurchaseRequest,
  toBranchPurchaseRequestResponse,
} from './branch-purchase-request.presenter';

/**
 * Regression: HQ_BRANCH approve must persist FIFO transfer cost,
 * never rebuild Сумма from rounded display unit × quantity.
 *
 * BPR-1786450868586 pattern:
 *   FIFO snapshot = 72823.21
 *   unit×qty 2 × 36245.25 = 72490.50 (forbidden reconstruction)
 */
const UNIT_PRICE = 36245.25;
const APPROVED_QTY = 2;
const FIFO_TOTAL = 72823.21;
const UNIT_TIMES_QTY = 72490.5;

describe('HQ_BRANCH approved FIFO totals persist across reopen (BPR-1786450868586)', () => {
  it('computes FIFO payable 72823.21 (not unit×qty 72490.50)', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 2,
      approvedQuantity: APPROVED_QTY,
      lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
      resolvedBranchPriceKgs: UNIT_PRICE,
      estimatedLineProductCostKgs: FIFO_TOTAL,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(lineTotal, FIFO_TOTAL);
    assert.notEqual(lineTotal, roundDisplayMoney(UNIT_PRICE * APPROVED_QTY));
    assert.notEqual(lineTotal, UNIT_TIMES_QTY);
  });

  it('franchise still uses commercial qty × branch price', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 10,
      approvedQuantity: 2,
      lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
      resolvedBranchPriceKgs: 1963.59,
      estimatedLineProductCostKgs: 630.15,
      hasPricingPolicyAtReview: true,
      branchType: 'FRANCHISE',
    });
    assert.equal(lineTotal, 3927.18);
  });

  it('persists commercial line/order totals through repair (save + DB reload + BA)', async () => {
    const request = {
      id: 'bpr-1786450868586',
      requestNumber: 'BPR-1786450868586',
      status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      reviewedAt: new Date(),
      totalEstimatedAmount: UNIT_TIMES_QTY,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: [
        {
          id: 'line-reducer',
          productId: 'prod-reducer',
          sku: 'RED-18',
          productName: 'Редуктор 18 зуб 4.3 кг',
          quantity: 2,
          approvedQuantity: APPROVED_QTY,
          lineStatus: 'APPROVED',
          unit: 'pcs',
          estimatedLineProductCostKgs: FIFO_TOTAL,
          resolvedBranchPriceKgs: UNIT_PRICE,
          wholesalePriceKgs: UNIT_PRICE,
          totalAmount: UNIT_TIMES_QTY,
          approvedLineTotalKgs: UNIT_TIMES_QTY,
          hasPricingPolicyAtSubmit: true,
          hasPricingPolicyAtReview: true,
        },
      ],
    };

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
          const row = request.items.find((item) => item.id === args.where.id);
          if (row) {
            row.totalAmount = args.data.totalAmount;
            row.approvedLineTotalKgs = args.data.approvedLineTotalKgs as number;
          }
          return row;
        },
      },
    };

    const result = await repairBranchPurchaseRequestDerivedTotalsInTx(tx, request.id);
    assert.equal(result.repairedOrderTotalKgs, FIFO_TOTAL);
    assert.equal(Number(request.items[0]?.totalAmount), FIFO_TOTAL);
    assert.equal(Number(request.totalEstimatedAmount), FIFO_TOTAL);

    const api = toBranchPurchaseRequestResponse(request);
    const ui = sanitizeBranchPurchaseRequest(request, true);
    assert.equal(api.totalEstimatedAmount, FIFO_TOTAL);
    assert.equal(ui.totalEstimatedAmount, FIFO_TOTAL);
    assert.equal(
      sumBranchPurchaseHqReviewLineAmountsKgs([
        {
          quantity: 2,
          approvedQuantity: APPROVED_QTY,
          lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
          resolvedBranchPriceKgs: UNIT_PRICE,
          estimatedLineProductCostKgs: FIFO_TOTAL,
          hasPricingPolicyAtReview: true,
          branchType: 'HQ_BRANCH',
        },
      ]),
      FIFO_TOTAL,
    );
  });
});
