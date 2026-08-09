import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import {
  shouldUseStoredBranchPurchaseCosts,
  sumStoredBranchPurchaseProductCostKgs,
  toBranchPurchaseRequestItemResponse,
  toBranchPurchaseRequestResponse,
} from './branch-purchase-request.presenter';

describe('branch-purchase-request.presenter', () => {
  it('uses stored line costs after HQ review', () => {
    assert.equal(
      shouldUseStoredBranchPurchaseCosts({
        status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
        reviewedAt: new Date(),
      }),
      true,
    );
  });

  it('sums stored product cost from line totals not unit×qty', () => {
    const total = sumStoredBranchPurchaseProductCostKgs([
      { quantity: 11, approvedQuantity: 11, estimatedLineProductCostKgs: 14756.12 },
      { quantity: 11, approvedQuantity: 11, estimatedLineProductCostKgs: 14756.13 },
    ]);
    assert.equal(total, 29512.25);
  });

  it('serializes item money fields to numbers', () => {
    const item = toBranchPurchaseRequestItemResponse({
      quantity: 11,
      approvedQuantity: 11,
      estimatedLineProductCostKgs: '914369.80',
      estimatedUnitCost: '83124.53',
      wholesalePriceKgs: '100',
      totalAmount: '1100',
      approvedLineTotalKgs: '1100',
      resolvedBranchPriceKgs: '100',
    });
    assert.equal(typeof item.estimatedLineProductCostKgs, 'number');
    assert.equal(item.estimatedLineProductCostKgs, 914369.8);
  });

  it('prefers authoritative item line totals over stale linked distribution total', () => {
    const response = toBranchPurchaseRequestResponse({
      status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      reviewedAt: new Date(),
      totalEstimatedAmount: 1000,
      transportCostKgs: 0,
      convertedOrderId: 'order-1',
      authoritativeTransferCostKgs: 914368.98,
      items: [
        {
          quantity: 11,
          approvedQuantity: 11,
          estimatedLineProductCostKgs: 914369.8,
        },
      ],
    });
    assert.equal(response.totalProductCostKgs, 914369.8);
    assert.equal(response.authoritativeTransferCostKgs, 914369.8);
  });

  it('uses linked transfer cost only when item line costs are absent', () => {
    const response = toBranchPurchaseRequestResponse({
      status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      reviewedAt: new Date(),
      totalEstimatedAmount: 1000,
      transportCostKgs: 0,
      convertedOrderId: 'order-1',
      authoritativeTransferCostKgs: 914369.8,
      items: [
        {
          quantity: 11,
          approvedQuantity: 11,
          estimatedLineProductCostKgs: 0,
        },
      ],
    });
    assert.equal(response.totalProductCostKgs, 914369.8);
  });

  it('returns items in authoritative position order', () => {
    const response = toBranchPurchaseRequestResponse({
      status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
      totalEstimatedAmount: 0,
      transportCostKgs: 0,
      items: [
        { id: 'line-d', position: 4, productName: 'D', quantity: 1, lineStatus: 'PENDING_REVIEW' },
        { id: 'line-b', position: 2, productName: 'B', quantity: 1, lineStatus: 'APPROVED', approvedQuantity: 1 },
        { id: 'line-a', position: 1, productName: 'A', quantity: 1, lineStatus: 'REJECTED', approvedQuantity: 0 },
        { id: 'line-c', position: 3, productName: 'C', quantity: 1, lineStatus: 'PENDING_REVIEW' },
      ],
    });

    assert.deepEqual(
      response.items.map((item) => (item as { productName?: string }).productName),
      ['A', 'B', 'C', 'D'],
    );
  });
});
