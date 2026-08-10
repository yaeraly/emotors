import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus, BranchType } from '@prisma/client';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { buildFifoAllocationLines } from '../pricing/pricing-fifo-allocation.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import {
  reconcileHqBranchTransferCostParity,
  resolveBranchPurchaseLinePayableAmount,
  shouldTransferBranchPurchaseAtCost,
} from './branch-purchase-estimated-amount.util';
import { sanitizeBranchPurchaseRequest } from './branch-purchase-request.presenter';

/**
 * Permanent HQ Office → HQ Branch transfer costing.
 *
 * Regression: BPR-1786197962954 showed 914369.08 instead of 914369.80 (−0.72).
 * Historical fix: 0007a11 / 83f92f7 — authoritative FIFO totals, markup 0%.
 * Regression source: 4330b1f / e00b597 — rebuilt totals as rounded unit × qty.
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

describe('HQ Branch at-cost permanent invariant', () => {
  it('Case 1 — exact first-batch: HQ source 914369.80 → BPR 914369.80 (diff 0.00)', () => {
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.HQ_BRANCH), true);

    const lines = buildExactBatchLines();
    const hqSource = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    assert.equal(hqSource, HQ_INVENTORY_TOTAL);

    const driftedUnitTimesQty = sumDisplayMoneyTotals(
      lines.map((line) => roundDisplayMoney(line.unitDisplay * line.quantity)),
    );
    assert.notEqual(driftedUnitTimesQty, HQ_INVENTORY_TOTAL);

    // After HQ Sales review, Branch Sales must show FIFO payable (not create-form unit×qty).
    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
        reviewedAt: new Date(),
        totalEstimatedAmount: driftedUnitTimesQty,
        transportCostKgs: 0,
        branch: { branchType: BranchType.HQ_BRANCH },
        items: lines.map((line, index) => ({
          id: `item-${index}`,
          productId: `prod-${index}`,
          sku: line.sku,
          productName: line.sku,
          quantity: line.quantity,
          approvedQuantity: line.quantity,
          lineStatus: 'APPROVED',
          unit: 'pcs',
          estimatedLineProductCostKgs: line.totalCostKgs,
          resolvedBranchPriceKgs: line.unitDisplay,
          wholesalePriceKgs: line.unitDisplay,
          totalAmount: roundDisplayMoney(line.unitDisplay * line.quantity),
        })),
      },
      true,
    );

    // Сумма заказа for HQ_BRANCH is FIFO payable (not commercial unit×qty).
    const payableTotals = sanitized.items.map((item) =>
      Number((item as { totalAmount?: number }).totalAmount ?? 0),
    );
    assert.equal(sumDisplayMoneyTotals(payableTotals), HQ_INVENTORY_TOTAL);
    assert.equal(Number(sanitized.totalEstimatedAmount ?? 0), HQ_INVENTORY_TOTAL);
    assert.notEqual(Number(sanitized.totalEstimatedAmount ?? 0), driftedUnitTimesQty);

    const fifoPayableTotals = lines.map((line) =>
      resolveBranchPurchaseLinePayableAmount({
        branchType: BranchType.HQ_BRANCH,
        quantity: line.quantity,
        estimatedLineProductCostKgs: line.totalCostKgs,
        unitPriceKgs: line.unitDisplay,
        hasPricingPolicy: true,
      }),
    );
    const costParity = reconcileHqBranchTransferCostParity({
      fifoLineCosts: lines.map((line) => line.totalCostKgs),
      payableLineTotals: fifoPayableTotals,
      orderTotalKgs: HQ_INVENTORY_TOTAL,
    });
    assert.equal(costParity.ok, true);
    assert.equal(costParity.expectedKgs, HQ_INVENTORY_TOTAL);
    assert.equal(costParity.differenceKgs, 0);
  });

  it('Case 2 — fractional unit cost: display rounding must not alter authoritative line total', () => {
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

  it('Case 3 — two procurement batches: BPR cost = sum of consumed FIFO layer costs', () => {
    // Same product: Batch1 remaining 10 @ layer 1234.567, Batch2 remaining 10 @ layer 987.654
    // HQ Branch requests 15 → consumes 10 from Batch1 + 5 from Batch2.
    const batch1Total = 12345.67;
    const batch2Total = 9876.54;
    const allocation = buildFifoAllocationLines(
      [
        {
          batchId: 'batch-1',
          remainingQuantity: 10,
          unitCostKgs: deriveDisplayUnitCost(batch1Total, 10),
          layerTotalCostKgs: batch1Total,
          layerBaseQuantity: 10,
        },
        {
          batchId: 'batch-2',
          remainingQuantity: 10,
          unitCostKgs: deriveDisplayUnitCost(batch2Total, 10),
          layerTotalCostKgs: batch2Total,
          layerBaseQuantity: 10,
        },
      ],
      15,
      { markupPercent: 0, branchType: 'HQ_BRANCH', subtractReserved: false },
    );

    assert.equal(allocation.allocatedQty, 15);
    assert.equal(allocation.lines.length, 2);
    assert.equal(allocation.lines[0]?.quantity, 10);
    assert.equal(allocation.lines[1]?.quantity, 5);
    // HQ markup 0%: transfer price equals FIFO cost for consumed layers.
    assert.equal(allocation.totalPriceKgs, allocation.totalCostKgs);

    const expected =
      allocation.lines[0]!.totalCostKgs + allocation.lines[1]!.totalCostKgs;
    assert.equal(allocation.totalCostKgs, roundDisplayMoney(expected));

    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType: BranchType.HQ_BRANCH,
      quantity: 15,
      estimatedLineProductCostKgs: allocation.totalCostKgs,
      unitPriceKgs: deriveDisplayUnitCost(allocation.totalCostKgs, 15),
      hasPricingPolicy: true,
    });
    assert.equal(payable, allocation.totalCostKgs);
    assert.notEqual(
      payable,
      roundDisplayMoney(deriveDisplayUnitCost(allocation.totalCostKgs, 15) * 15),
    );
  });

  it('Case 4 — normal franchise branch still uses CEO Продажа филиалам price', () => {
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.FRANCHISE), false);
    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType: BranchType.FRANCHISE,
      quantity: 11,
      estimatedLineProductCostKgs: 1000,
      unitPriceKgs: 125,
      hasPricingPolicy: true,
    });
    assert.equal(payable, 1375);
    assert.notEqual(payable, 1000);
  });

  it('Case 5 — allocation remainder reconciles exactly to procurement total', () => {
    const rawShares = Array.from({ length: 62 }, (_, index) => 14756.123456 + (index % 17) * 0.314159);
    const allocated = distributeRoundedAmounts(rawShares, HQ_INVENTORY_TOTAL);
    assert.equal(sumDisplayMoneyTotals(allocated), HQ_INVENTORY_TOTAL);
    assert.equal(roundDisplayMoney(HQ_INVENTORY_TOTAL - sumDisplayMoneyTotals(allocated)), 0);
  });

  it('HQ Branch markup is always 0% (never unit×qty fallback when FIFO missing)', () => {
    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType: BranchType.HQ_BRANCH,
      quantity: 11,
      estimatedLineProductCostKgs: 0,
      unitPriceKgs: 14756.12,
      hasPricingPolicy: true,
    });
    assert.equal(payable, 0);
  });
});
