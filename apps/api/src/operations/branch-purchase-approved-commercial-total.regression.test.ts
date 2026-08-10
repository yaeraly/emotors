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
 * Regression: HQ_BRANCH approve must persist FIFO payable Сумма, not commercial unit×qty.
 *
 * BPR-1786349778733 pattern:
 *   saved FIFO line = 72490.50
 *   wrong commercial 2 × 33935.07 = 67870.14
 * Never restore commercial after leave/reopen.
 */
const UNIT_PRICE = 33935.07;
const APPROVED_QTY = 2;
const EXPECTED_FIFO_TOTAL = 72490.5;
const WRONG_COMMERCIAL_TOTAL = 67870.14;

describe('HQ_BRANCH approved FIFO totals persist across reopen (BPR-1786349778733)', () => {
  it('computes FIFO payable 72490.50 (not commercial 67870.14)', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 2,
      approvedQuantity: APPROVED_QTY,
      lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
      resolvedBranchPriceKgs: UNIT_PRICE,
      estimatedLineProductCostKgs: EXPECTED_FIFO_TOTAL,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(lineTotal, EXPECTED_FIFO_TOTAL);
    assert.notEqual(lineTotal, roundDisplayMoney(UNIT_PRICE * APPROVED_QTY));
    assert.notEqual(lineTotal, WRONG_COMMERCIAL_TOTAL);
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

  it('persists FIFO line/order totals through repair (save + DB reload + BA)', async () => {
    const request = {
      id: 'bpr-1786349778733',
      requestNumber: 'BPR-1786349778733',
      status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      reviewedAt: new Date(),
      totalEstimatedAmount: WRONG_COMMERCIAL_TOTAL,
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
          estimatedLineProductCostKgs: EXPECTED_FIFO_TOTAL,
          resolvedBranchPriceKgs: UNIT_PRICE,
          totalAmount: WRONG_COMMERCIAL_TOTAL,
          approvedLineTotalKgs: WRONG_COMMERCIAL_TOTAL,
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
    assert.equal(result.repairedOrderTotalKgs, EXPECTED_FIFO_TOTAL);
    assert.equal(Number(request.items[0]?.totalAmount), EXPECTED_FIFO_TOTAL);
    assert.equal(Number(request.totalEstimatedAmount), EXPECTED_FIFO_TOTAL);

    const api = toBranchPurchaseRequestResponse(request);
    const ui = sanitizeBranchPurchaseRequest(request, true);
    assert.equal(api.totalEstimatedAmount, EXPECTED_FIFO_TOTAL);
    assert.equal(ui.totalEstimatedAmount, EXPECTED_FIFO_TOTAL);
    assert.equal(sumBranchPurchaseHqReviewLineAmountsKgs([
      {
        quantity: 2,
        approvedQuantity: APPROVED_QTY,
        lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
        resolvedBranchPriceKgs: UNIT_PRICE,
        estimatedLineProductCostKgs: EXPECTED_FIFO_TOTAL,
        hasPricingPolicyAtReview: true,
        branchType: 'HQ_BRANCH',
      },
    ]), EXPECTED_FIFO_TOTAL);
  });
});
