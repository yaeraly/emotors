import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import {
  resolveBranchPurchaseBranchLineTotalKgs,
  resolveBranchPurchaseBranchUnitPriceKgs,
  sumBranchPurchaseBranchLineTotalsKgs,
} from './branch-purchase-branch-display.util';
import { sanitizeBranchPurchaseRequest } from './branch-purchase-request.presenter';

describe('branch purchase branch display totals', () => {
  it('calculates line total as quantity times resolved branch price', () => {
    assert.equal(
      resolveBranchPurchaseBranchLineTotalKgs({
        quantity: 3,
        resolvedBranchPriceKgs: 15000,
        totalAmount: 0,
      }),
      45000,
    );
  });

  it('calculates qty 10 times 2500 as 25000', () => {
    assert.equal(
      resolveBranchPurchaseBranchLineTotalKgs({
        quantity: 10,
        branchPurchasePriceKgs: 2500,
        totalAmount: 0,
      }),
      25000,
    );
  });

  it('does not use wholesale when resolved branch price exists', () => {
    assert.equal(
      resolveBranchPurchaseBranchUnitPriceKgs({
        resolvedBranchPriceKgs: 15000,
        branchPurchasePriceKgs: 8000,
      }),
      8000,
    );
    assert.equal(
      resolveBranchPurchaseBranchUnitPriceKgs({
        resolvedBranchPriceKgs: 15000,
      }),
      15000,
    );
  });

  it('sums independent line totals for order total', () => {
    assert.equal(
      sumBranchPurchaseBranchLineTotalsKgs([
        { quantity: 3, resolvedBranchPriceKgs: 15000, totalAmount: 0 },
        { quantity: 10, branchPurchasePriceKgs: 2500, totalAmount: 0 },
        { quantity: 2, resolvedBranchPriceKgs: 15000, totalAmount: 0 },
      ]),
      100000,
    );
  });

  it('sanitized branch-only response repairs stale zero line totals', () => {
    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.SUBMITTED,
        reviewedAt: null,
        totalEstimatedAmount: 0,
        transportCostKgs: 0,
        branch: { branchType: 'FRANCHISE' },
        items: [
          {
            id: 'line-1',
            productId: 'prod-1',
            sku: 'SKU-1',
            productName: 'Контроллер',
            quantity: 3,
            unit: 'pcs',
            resolvedBranchPriceKgs: 15000,
            wholesalePriceKgs: 12000,
            totalAmount: 0,
          },
          {
            id: 'line-2',
            productId: 'prod-2',
            sku: 'SKU-2',
            productName: 'Датчик',
            quantity: 10,
            unit: 'pcs',
            resolvedBranchPriceKgs: 2500,
            wholesalePriceKgs: 2000,
            totalAmount: 0,
          },
        ],
      },
      true,
    );

    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, 45000);
    assert.equal((sanitized.items[1] as { totalAmount?: number }).totalAmount, 25000);
    assert.equal(sanitized.totalEstimatedAmount, 70000);
    assert.equal((sanitized.items[0] as { branchPurchasePriceKgs?: number }).branchPurchasePriceKgs, 15000);
    assert.equal((sanitized.items[0] as { wholesalePriceKgs?: unknown }).wholesalePriceKgs, undefined);
  });
});
