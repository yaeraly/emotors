import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { buildBranchReceiveLinesFromHqAllocations } from './pricing-fifo-branch-receive.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from './product-cost-precision.util';
import { buildInventoryCountDiscrepancySummary } from '../inventory-count/inventory-count-summary.util';

const CHINA_BATCH_TOTAL = 914369.8;
/** Production Branch inventory/count observed stale total before the fix. */
const PRODUCTION_STALE_BRANCH_TOTAL = 914369.26;
const PRODUCTION_DRIFT = 0.54;

function buildChinaBatchLines() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  return distributeRoundedAmounts(rawShares, CHINA_BATCH_TOTAL).map((totalCostKgs, index) => ({
    id: `alloc-${index}`,
    fifoBatchId: `hq-${index}`,
    quantity,
    totalCostKgs,
    unitCostKgs: deriveDisplayUnitCost(totalCostKgs, quantity),
  }));
}

/** Handcrafted lines whose unit×qty drift sums exactly to the production 0.54 KGS. */
function buildProductionDriftFixture() {
  // 54 lines each lose 0.01 KGS via unit×qty, totaling 0.54 KGS.
  return Array.from({ length: 54 }, (_, index) => {
    const totalCostKgs = 100.01;
    const quantity = 10;
    const unitCostKgs = deriveDisplayUnitCost(totalCostKgs, quantity); // 10.00
    return {
      id: `drift-${index}`,
      fifoBatchId: `hq-drift-${index}`,
      quantity,
      totalCostKgs,
      unitCostKgs,
    };
  });
}

describe('Branch inventory cost parity — first China shipment 914369.80', () => {
  const lines = buildChinaBatchLines();

  it('first China shipment landed cost equals 914369.80 KGS', () => {
    assert.equal(sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs)), CHINA_BATCH_TOTAL);
  });

  it('HQ full FIFO consumption equals 914369.80 KGS', () => {
    assert.equal(sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs)), CHINA_BATCH_TOTAL);
  });

  it('documents production stale Branch total 914369.26 and 0.54 KGS drift', () => {
    assert.equal(
      roundDisplayMoney(CHINA_BATCH_TOTAL - PRODUCTION_STALE_BRANCH_TOTAL),
      PRODUCTION_DRIFT,
    );
  });

  it('unit×qty path drifts from authoritative total (source of Branch mismatch)', () => {
    const stale = sumDisplayMoneyTotals(
      lines.map((line) => roundDisplayMoney(line.unitCostKgs * line.quantity)),
    );
    assert.notEqual(stale, CHINA_BATCH_TOTAL);
    assert.notEqual(roundDisplayMoney(CHINA_BATCH_TOTAL - stale), 0);
  });

  it('item-level unit×qty differences can sum exactly to 0.54 KGS', () => {
    const fixture = buildProductionDriftFixture();
    const authoritative = sumDisplayMoneyTotals(fixture.map((line) => line.totalCostKgs));
    const stale = sumDisplayMoneyTotals(
      fixture.map((line) => roundDisplayMoney(line.unitCostKgs * line.quantity)),
    );
    assert.equal(roundDisplayMoney(authoritative - stale), PRODUCTION_DRIFT);
    assert.equal(PRODUCTION_DRIFT, 0.54);
  });

  it('HQ-to-Branch transfer / Branch receipt totals equal 914369.80 when totalCostKgs is passed', () => {
    const receiveLines = buildBranchReceiveLinesFromHqAllocations(
      lines,
      lines.reduce((s, l) => s + l.quantity, 0),
      0,
    );
    const branchTotal = sumDisplayMoneyTotals(receiveLines.map((line) => line.lineTotalCostKgs));
    assert.equal(branchTotal, CHINA_BATCH_TOTAL);
    assert.notEqual(branchTotal, PRODUCTION_STALE_BRANCH_TOTAL);
  });

  it('Branch FIFO original/remaining value equals 914369.80 KGS', () => {
    const receiveLines = buildBranchReceiveLinesFromHqAllocations(
      lines,
      lines.reduce((s, l) => s + l.quantity, 0),
      0,
    );
    assert.equal(sumDisplayMoneyTotals(receiveLines.map((l) => l.lineTotalCostKgs)), CHINA_BATCH_TOTAL);
  });

  it('Branch CEO inventory value equals 914369.80 KGS (FIFO remaining source)', () => {
    const branchFifoRemaining = sumDisplayMoneyTotals(
      buildBranchReceiveLinesFromHqAllocations(
        lines,
        lines.reduce((s, l) => s + l.quantity, 0),
        0,
      ).map((line) => line.lineTotalCostKgs),
    );
    assert.equal(branchFifoRemaining, CHINA_BATCH_TOTAL);
  });

  it('Branch inventory count with all physical quantities 0 equals -914369.80 KGS', () => {
    const receiveLines = buildBranchReceiveLinesFromHqAllocations(
      lines,
      lines.reduce((s, l) => s + l.quantity, 0),
      0,
    );
    const summary = buildInventoryCountDiscrepancySummary(
      receiveLines.map((line) => ({
        actualQuantity: 0,
        differenceQuantity: -line.quantity,
        differenceValueKgs: -line.lineTotalCostKgs,
      })),
    );
    assert.equal(summary.totalDifferenceValueKgs, -CHINA_BATCH_TOTAL);
    assert.notEqual(summary.totalDifferenceValueKgs, -PRODUCTION_STALE_BRANCH_TOTAL);
  });

  it('difference becomes 0.00 KGS vs HQ', () => {
    const branchTotal = sumDisplayMoneyTotals(
      buildBranchReceiveLinesFromHqAllocations(
        lines,
        lines.reduce((s, l) => s + l.quantity, 0),
        0,
      ).map((line) => line.lineTotalCostKgs),
    );
    assert.equal(roundDisplayMoney(CHINA_BATCH_TOTAL - branchTotal), 0);
  });

  it('previous stale value 914369.26 is not reproduced by authoritative receive lines', () => {
    const branchTotal = sumDisplayMoneyTotals(
      buildBranchReceiveLinesFromHqAllocations(
        lines,
        lines.reduce((s, l) => s + l.quantity, 0),
        0,
      ).map((line) => line.lineTotalCostKgs),
    );
    assert.notEqual(branchTotal, PRODUCTION_STALE_BRANCH_TOTAL);
  });

  it('displayed rounded unit cost is not used for authoritative total', () => {
    const receiveLines = buildBranchReceiveLinesFromHqAllocations(
      lines,
      lines.reduce((s, l) => s + l.quantity, 0),
      0,
    );
    const rebuiltFromDisplayUnit = sumDisplayMoneyTotals(
      receiveLines.map((line) => roundDisplayMoney(line.finalBranchUnitCostKgs * line.quantity)),
    );
    assert.notEqual(rebuiltFromDisplayUnit, CHINA_BATCH_TOTAL);
    assert.equal(sumDisplayMoneyTotals(receiveLines.map((l) => l.lineTotalCostKgs)), CHINA_BATCH_TOTAL);
  });
});
