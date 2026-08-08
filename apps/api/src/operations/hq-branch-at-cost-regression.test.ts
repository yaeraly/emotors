import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus, BranchType } from '@prisma/client';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import {
  resolveBranchPurchaseLinePayableAmount,
  shouldTransferBranchPurchaseAtCost,
} from './branch-purchase-estimated-amount.util';
import { sanitizeBranchPurchaseRequest } from './branch-purchase-request.presenter';

/**
 * Regression: BPR-1786197962954 showed 914369.08 instead of procurement 914369.80 (−0.72).
 *
 * Historical fix: 0007a11 / 83f92f7 — Branch Sales Сумма uses authoritative FIFO totals.
 * Regression: 4330b1f / e00b597 — rebuilt totals as rounded unit × qty for all branches.
 */
const HQ_INVENTORY_TOTAL = 914369.8;

function buildExactBatchLines() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  return distributeRoundedAmounts(rawShares, HQ_INVENTORY_TOTAL).map((totalCostKgs, index) => ({
    sku: `SKU-${index}`,
    quantity,
    totalCostKgs,
    unitDisplay: deriveDisplayUnitCost(totalCostKgs, quantity),
  }));
}

describe('HQ Branch at-cost regression — 914369.80 must not become 914369.08', () => {
  it('detects HQ Branch by BranchType.HQ_BRANCH with 0% markup', () => {
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.HQ_BRANCH), true);
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.FRANCHISE), false);
  });

  it('Given HQ inventory total 914369.80, HQ Branch BPR total is 914369.80 (diff 0.00)', () => {
    const lines = buildExactBatchLines();
    const hqSource = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    assert.equal(hqSource, HQ_INVENTORY_TOTAL);

    const driftedUnitTimesQty = sumDisplayMoneyTotals(
      lines.map((line) => roundDisplayMoney(line.unitDisplay * line.quantity)),
    );
    assert.notEqual(driftedUnitTimesQty, HQ_INVENTORY_TOTAL);

    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.DRAFT,
        reviewedAt: null,
        totalEstimatedAmount: driftedUnitTimesQty,
        transportCostKgs: 0,
        branch: { branchType: BranchType.HQ_BRANCH },
        items: lines.map((line, index) => ({
          id: `item-${index}`,
          productId: `prod-${index}`,
          sku: line.sku,
          productName: line.sku,
          quantity: line.quantity,
          unit: 'pcs',
          estimatedLineProductCostKgs: line.totalCostKgs,
          resolvedBranchPriceKgs: line.unitDisplay,
          wholesalePriceKgs: line.unitDisplay,
          totalAmount: roundDisplayMoney(line.unitDisplay * line.quantity),
        })),
      },
      true,
    );

    const bprLineSum = sumDisplayMoneyTotals(
      sanitized.items.map((item) => Number((item as { totalAmount?: number }).totalAmount ?? 0)),
    );
    assert.equal(bprLineSum, HQ_INVENTORY_TOTAL);
    assert.equal(sanitized.totalEstimatedAmount, HQ_INVENTORY_TOTAL);
    assert.equal(roundDisplayMoney(hqSource - Number(sanitized.totalEstimatedAmount)), 0);
  });

  it('raw per-unit costs with >2 decimal places do not drift when using FIFO line cost', () => {
    // 100.005 × 3 = 300.015 → authoritative line 300.02 after money round;
    // rounded unit 100.01 × 3 = 300.03 (different) — payable must use line cost.
    const rawLineCost = 300.015;
    const qty = 3;
    const displayUnit = deriveDisplayUnitCost(rawLineCost, qty);
    const unitTimesQty = roundDisplayMoney(displayUnit * qty);
    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType: BranchType.HQ_BRANCH,
      quantity: qty,
      estimatedLineProductCostKgs: roundDisplayMoney(rawLineCost),
      unitPriceKgs: displayUnit,
      hasPricingPolicy: true,
    });
    assert.equal(payable, roundDisplayMoney(rawLineCost));
    assert.notEqual(payable, unitTimesQty);
  });

  it('franchise branches still use unit × CEO branch price', () => {
    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType: BranchType.FRANCHISE,
      quantity: 11,
      estimatedLineProductCostKgs: 1000,
      unitPriceKgs: 125,
      hasPricingPolicy: true,
    });
    assert.equal(payable, 1375);
  });
});
