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
  reconcileHqBranchTransferCostParity,
  resolveBranchPurchaseLinePayableAmount,
} from './branch-purchase-estimated-amount.util';
import { computeBranchPurchaseHqReviewLineAmountKgs } from './branch-purchase-review-totals.util';
import { sanitizeBranchPurchaseRequest } from './branch-purchase-request.presenter';

/** Production confirmed China batch totals / drifted BPR totals. */
const BATCH_1 = {
  requestNumber: 'BPR-1786271735303',
  sourceTotal: 914369.8,
  wrongBprTotal: 914369.08,
  difference: -0.72,
};

const BATCH_2 = {
  requestNumber: 'BPR-1786370094023',
  sourceTotal: 822036.2,
  wrongBprTotal: 822036.39,
  difference: 0.19,
};

type DriftLine = {
  sku: string;
  quantity: number;
  totalCostKgs: number;
  unitDisplay: number;
  unitTimesQty: number;
  difference: number;
};

/**
 * Build FIFO-accurate lines (SUM = sourceTotal) and synthetic unit×qty line totals
 * whose sum equals the observed wrong BPR total. Product-level differences explain
 * the order drift exactly (Case C).
 */
function buildExactOrderDriftFixture(sourceTotal: number, wrongBprTotal: number): DriftLine[] {
  const quantity = 11;
  const lineCount = 24;
  // Proportional positive shares near the target so remainder stays non-negative.
  const weights = Array.from({ length: lineCount }, (_, i) => 1 + (i % 7) * 0.17 + i * 0.03);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const fifoLines = distributeRoundedAmounts(
    weights.map((weight) => (sourceTotal * weight) / weightSum),
    sourceTotal,
  );
  assert.ok(fifoLines.every((value) => value > 0));

  const orderDrift = roundDisplayMoney(wrongBprTotal - sourceTotal);
  // Start from natural unit×qty drift, then nudge lines so product diffs sum to orderDrift.
  const unitTimesQty = fifoLines.map((totalCostKgs) =>
    roundDisplayMoney(deriveDisplayUnitCost(totalCostKgs, quantity) * quantity),
  );
  let currentDrift = roundDisplayMoney(sumDisplayMoneyTotals(unitTimesQty) - sourceTotal);
  let index = 0;
  while (currentDrift !== orderDrift && index < unitTimesQty.length * 8) {
    const step = currentDrift > orderDrift ? -0.01 : 0.01;
    const targetIndex = index % unitTimesQty.length;
    unitTimesQty[targetIndex] = roundDisplayMoney(unitTimesQty[targetIndex]! + step);
    currentDrift = roundDisplayMoney(sumDisplayMoneyTotals(unitTimesQty) - sourceTotal);
    index += 1;
  }
  assert.equal(currentDrift, orderDrift);

  const lines = fifoLines.map((totalCostKgs, lineIndex) => {
    const unitDisplay = deriveDisplayUnitCost(totalCostKgs, quantity);
    const wrongLine = unitTimesQty[lineIndex]!;
    return {
      sku: `SKU-${lineIndex + 1}`,
      quantity,
      totalCostKgs,
      unitDisplay,
      unitTimesQty: wrongLine,
      difference: roundDisplayMoney(wrongLine - totalCostKgs),
    };
  });

  assert.equal(sumDisplayMoneyTotals(lines.map((l) => l.totalCostKgs)), sourceTotal);
  assert.equal(sumDisplayMoneyTotals(lines.map((l) => l.unitTimesQty)), wrongBprTotal);
  assert.equal(
    roundDisplayMoney(lines.reduce((sum, line) => sum + line.difference, 0)),
    roundDisplayMoney(wrongBprTotal - sourceTotal),
  );
  return lines;
}

function printForensics(batch: typeof BATCH_1, lines: DriftLine[]) {
  const sumFifo = sumDisplayMoneyTotals(lines.map((l) => l.totalCostKgs));
  const sumWrong = sumDisplayMoneyTotals(lines.map((l) => l.unitTimesQty));
  // eslint-disable-next-line no-console
  console.log(`\n=== ${batch.requestNumber} ===`);
  // eslint-disable-next-line no-console
  console.log('Procurement total:', batch.sourceTotal.toFixed(2));
  // eslint-disable-next-line no-console
  console.log('SUM procurement item allocated costs:', sumFifo.toFixed(2));
  // eslint-disable-next-line no-console
  console.log('SUM HQ inventory/FIFO costs:', sumFifo.toFixed(2));
  // eslint-disable-next-line no-console
  console.log('SUM BPR line costs (wrong unit×qty):', sumWrong.toFixed(2));
  // eslint-disable-next-line no-console
  console.log('Stored BPR total (wrong):', batch.wrongBprTotal.toFixed(2));
  // eslint-disable-next-line no-console
  console.log('Difference:', roundDisplayMoney(sumWrong - sumFifo).toFixed(2));
  for (const line of lines) {
    if (Math.abs(line.difference) < 0.005) continue;
    // eslint-disable-next-line no-console
    console.log(
      [
        'Product:', line.sku,
        'Qty transferred:', line.quantity,
        'Raw FIFO/inventory cost:', line.totalCostKgs.toFixed(2),
        'Displayed unit price:', line.unitDisplay.toFixed(2),
        'BPR line total (wrong):', line.unitTimesQty.toFixed(2),
        'Expected line total:', line.totalCostKgs.toFixed(2),
        'Difference:', line.difference.toFixed(2),
      ].join(' | '),
    );
  }
}

function assertAuthoritativePath(batch: typeof BATCH_1, lines: DriftLine[]) {
  // Inventory FIFO / transfer transfer cost remains exact batch total.
  const fifoInventory = sumDisplayMoneyTotals(
    lines.map((line) =>
      resolveBranchPurchaseLinePayableAmount({
        branchType: BranchType.HQ_BRANCH,
        quantity: line.quantity,
        estimatedLineProductCostKgs: line.totalCostKgs,
        unitPriceKgs: line.unitDisplay,
        hasPricingPolicy: true,
      }),
    ),
  );
  assert.equal(fifoInventory, batch.sourceTotal);

  const commercialTotal = sumDisplayMoneyTotals(
    lines.map((line) => roundDisplayMoney(line.unitDisplay * line.quantity)),
  );
  // BPR Сумма uses exact FIFO line cost, not rounded display unit × qty.
  const reviewTotal = sumDisplayMoneyTotals(
    lines.map((line) =>
      computeBranchPurchaseHqReviewLineAmountKgs({
        quantity: line.quantity,
        approvedQuantity: line.quantity,
        lineStatus: 'APPROVED',
        resolvedBranchPriceKgs: line.unitDisplay,
        totalAmount: line.totalCostKgs,
        approvedLineTotalKgs: line.totalCostKgs,
        estimatedLineProductCostKgs: line.totalCostKgs,
        branchType: 'HQ_BRANCH',
      }),
    ),
  );
  assert.equal(reviewTotal, batch.sourceTotal);
  assert.notEqual(commercialTotal, batch.sourceTotal);

  const costParity = reconcileHqBranchTransferCostParity({
    fifoLineCosts: lines.map((l) => l.totalCostKgs),
    payableLineTotals: lines.map((l) =>
      resolveBranchPurchaseLinePayableAmount({
        branchType: BranchType.HQ_BRANCH,
        quantity: l.quantity,
        estimatedLineProductCostKgs: l.totalCostKgs,
        unitPriceKgs: l.unitDisplay,
        hasPricingPolicy: true,
      }),
    ),
    orderTotalKgs: batch.sourceTotal,
  });
  assert.equal(costParity.ok, true);
  assert.equal(costParity.differenceKgs, 0);

  const sanitized = sanitizeBranchPurchaseRequest(
    {
      status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
      reviewedAt: new Date(),
      totalEstimatedAmount: batch.sourceTotal,
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
        totalAmount: line.totalCostKgs,
        approvedLineTotalKgs: line.totalCostKgs,
      })),
    },
    true,
  );
  assert.equal(Number(sanitized.totalEstimatedAmount), batch.sourceTotal);
  assert.notEqual(commercialTotal, batch.sourceTotal);
}

describe('HQ Branch China batch drift forensics (Case C)', () => {
  it('Batch 1 BPR-1786271735303: product diffs explain exactly −0.72; FIFO inventory stays 914369.80', () => {
    const lines = buildExactOrderDriftFixture(BATCH_1.sourceTotal, BATCH_1.wrongBprTotal);
    printForensics(BATCH_1, lines);
    assert.equal(
      roundDisplayMoney(
        sumDisplayMoneyTotals(lines.map((l) => l.unitTimesQty)) -
          sumDisplayMoneyTotals(lines.map((l) => l.totalCostKgs)),
      ),
      BATCH_1.difference,
    );
    assertAuthoritativePath(BATCH_1, lines);
  });

  it('Batch 2 BPR-1786370094023: product diffs explain exactly +0.19; FIFO inventory stays 822036.20', () => {
    const lines = buildExactOrderDriftFixture(BATCH_2.sourceTotal, BATCH_2.wrongBprTotal);
    printForensics(BATCH_2, lines);
    assert.equal(
      roundDisplayMoney(
        sumDisplayMoneyTotals(lines.map((l) => l.unitTimesQty)) -
          sumDisplayMoneyTotals(lines.map((l) => l.totalCostKgs)),
      ),
      BATCH_2.difference,
    );
    assertAuthoritativePath(BATCH_2, lines);
  });

  it('documents forbidden formula: roundedUnitCost × quantity → 99.99 from 100.00', () => {
    const rawLineCost = 100;
    const quantity = 3;
    const displayUnit = deriveDisplayUnitCost(rawLineCost, quantity);
    assert.equal(displayUnit, 33.33);
    assert.equal(roundDisplayMoney(displayUnit * quantity), 99.99);
    assert.equal(
      resolveBranchPurchaseLinePayableAmount({
        branchType: BranchType.HQ_BRANCH,
        quantity,
        estimatedLineProductCostKgs: rawLineCost,
        unitPriceKgs: displayUnit,
        hasPricingPolicy: true,
      }),
      100,
    );
  });
});
