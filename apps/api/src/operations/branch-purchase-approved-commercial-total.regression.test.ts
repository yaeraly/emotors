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
 * Regression: HQ Sales approve must persist commercial Сумма, not FIFO cost.
 *
 * unitPrice = 1963.59, approvedQuantity = 2 → lineTotal = 3927.18
 * Never restore FIFO 630.15 after leave/reopen.
 */
const UNIT_PRICE = 1963.59;
const APPROVED_QTY = 2;
const EXPECTED_LINE_TOTAL = 3927.18;
const FIFO_COST = 630.15;
const STALE_ORDER_TOTAL = 67870.14;

describe('HQ Sales approved commercial totals persist across reopen', () => {
  it('computes 2 × 1963.59 = 3927.18 (not FIFO 630.15)', () => {
    const lineTotal = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: 10,
      approvedQuantity: APPROVED_QTY,
      lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
      resolvedBranchPriceKgs: UNIT_PRICE,
      estimatedLineProductCostKgs: FIFO_COST,
      hasPricingPolicyAtReview: true,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(lineTotal, EXPECTED_LINE_TOTAL);
    assert.equal(roundDisplayMoney(UNIT_PRICE * APPROVED_QTY), EXPECTED_LINE_TOTAL);
    assert.notEqual(lineTotal, FIFO_COST);
  });

  it('persists commercial line/order totals through repair (simulates save + DB reload)', async () => {
    const request = {
      id: 'bpr-reducer-commercial',
      requestNumber: 'BPR-REDUCER-COMMERCIAL',
      status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
      reviewedAt: null,
      totalEstimatedAmount: STALE_ORDER_TOTAL,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: [
        {
          id: 'line-reducer',
          productId: 'prod-reducer',
          sku: 'RED-18',
          productName: 'Редуктор 18 зуб 4.3 кг',
          quantity: 10,
          approvedQuantity: APPROVED_QTY,
          lineStatus: 'APPROVED',
          unit: 'pcs',
          estimatedLineProductCostKgs: FIFO_COST,
          resolvedBranchPriceKgs: UNIT_PRICE,
          // Wrong persisted values that used to return after reopen:
          totalAmount: FIFO_COST,
          approvedLineTotalKgs: FIFO_COST,
          hasPricingPolicyAtSubmit: true,
          hasPricingPolicyAtReview: true,
        },
        {
          id: 'line-other',
          productId: 'prod-other',
          sku: 'OTH-1',
          productName: 'Other',
          quantity: 1,
          approvedQuantity: 1,
          lineStatus: 'APPROVED',
          unit: 'pcs',
          estimatedLineProductCostKgs: 100,
          resolvedBranchPriceKgs: 1000,
          totalAmount: 100,
          approvedLineTotalKgs: 100,
          hasPricingPolicyAtSubmit: true,
          hasPricingPolicyAtReview: true,
        },
      ],
    };

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
          updates.push({
            id: args.where.id,
            totalAmount: args.data.totalAmount,
            approvedLineTotalKgs: args.data.approvedLineTotalKgs,
          });
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

    assert.equal(result.lineRepairs.find((r) => r.itemId === 'line-reducer')?.repairedKgs, EXPECTED_LINE_TOTAL);
    assert.equal(Number(request.items[0]?.totalAmount), EXPECTED_LINE_TOTAL);
    assert.equal(Number(request.items[0]?.approvedLineTotalKgs), EXPECTED_LINE_TOTAL);
    assert.notEqual(Number(request.items[0]?.totalAmount), FIFO_COST);

    const expectedOrderTotal = roundDisplayMoney(EXPECTED_LINE_TOTAL + 1000);
    assert.equal(result.repairedOrderTotalKgs, expectedOrderTotal);
    assert.equal(Number(request.totalEstimatedAmount), expectedOrderTotal);
    assert.notEqual(Number(request.totalEstimatedAmount), STALE_ORDER_TOTAL);
    assert.notEqual(Number(request.totalEstimatedAmount), FIFO_COST);

    // Simulate leave → reopen: presenter/API reload from repaired DB state.
    const reloaded = {
      ...request,
      status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
      reviewedAt: new Date(),
    };
    const api = toBranchPurchaseRequestResponse(reloaded);
    const ui = sanitizeBranchPurchaseRequest(reloaded, true);
    const apiReducer = api.items.find((item) => (item as { id?: string }).id === 'line-reducer') as {
      totalAmount?: number;
    };
    const uiReducer = ui.items.find((item) => (item as { id?: string }).id === 'line-reducer') as {
      totalAmount?: number;
    };

    assert.equal(apiReducer?.totalAmount, EXPECTED_LINE_TOTAL);
    assert.equal(api.totalEstimatedAmount, expectedOrderTotal);
    assert.equal(uiReducer?.totalAmount, EXPECTED_LINE_TOTAL);
    assert.equal(ui.totalEstimatedAmount, expectedOrderTotal);

    const orderFromLines = sumBranchPurchaseHqReviewLineAmountsKgs(
      reloaded.items.map((item) => ({
        quantity: item.quantity,
        approvedQuantity: item.approvedQuantity,
        lineStatus: item.lineStatus,
        resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
        estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
        hasPricingPolicyAtReview: true,
        branchType: 'HQ_BRANCH',
      })),
    );
    assert.equal(orderFromLines, expectedOrderTotal);
    assert.equal(orderFromLines, api.totalEstimatedAmount);
  });

  it('reject zeroes commercial line total and order total recalculates from all lines', () => {
    const items = [
      {
        quantity: 10,
        approvedQuantity: 2,
        lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
        resolvedBranchPriceKgs: UNIT_PRICE,
        estimatedLineProductCostKgs: FIFO_COST,
        hasPricingPolicyAtReview: true,
        branchType: 'HQ_BRANCH',
      },
      {
        quantity: 5,
        approvedQuantity: 0,
        lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
        resolvedBranchPriceKgs: 1000,
        estimatedLineProductCostKgs: 500,
        hasPricingPolicyAtReview: true,
        branchType: 'HQ_BRANCH',
      },
    ];
    assert.equal(computeBranchPurchaseHqReviewLineAmountKgs(items[1]!), 0);
    assert.equal(sumBranchPurchaseHqReviewLineAmountsKgs(items), EXPECTED_LINE_TOTAL);
  });
});
