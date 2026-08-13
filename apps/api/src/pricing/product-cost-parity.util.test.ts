import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { resolveMovementCostUpdates } from '../procurement/landed-cost-sync-movements.util';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';
import {
  allocateProportionalCost,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from './product-cost-precision.util';

/** Regression batch total reported in production (China procurement vs branch sales). */
const CHINA_BATCH_PRODUCT_COST_TOTAL = 914369.8;
/** Production drift when rounding unit cost before multiplying (observed −0.62 KGS on this batch). */
const PRODUCTION_LEGACY_DRIFT_KGS = 0.62;

function legacyUnitTimesQtyTotal(lineTotals: Array<{ totalCostKgs: number; quantity: number }>) {
  return roundDisplayMoney(
    lineTotals.reduce((sum, line) => {
      const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
      return sum + unit * line.quantity;
    }, 0),
  );
}

function buildRepresentativeChinaBatchLines(): Array<{
  totalCostKgs: number;
  quantity: number;
  batchId: string;
}> {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_PRODUCT_COST_TOTAL);
  return lineTotals.map((totalCostKgs, index) => ({
    batchId: `batch-${index}`,
    totalCostKgs,
    quantity,
  }));
}

function aggregateFifoProductCost(
  lines: Array<{ totalCostKgs: number; quantity: number; batchId: string }>,
) {
  let total = 0;
  for (const line of lines) {
    const result = buildFifoAllocationLines(
      [
        {
          batchId: line.batchId,
          remainingQuantity: line.quantity,
          unitCostKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
          layerTotalCostKgs: line.totalCostKgs,
          layerBaseQuantity: line.quantity,
        },
      ],
      line.quantity,
      { markupPercent: 0, branchType: 'HQ_BRANCH', subtractReserved: false },
    );
    total += result.totalCostKgs;
  }
  return roundDisplayMoney(total);
}

describe('product cost parity — China batch 914369.80 KGS', () => {
  it('legacy unit×qty aggregation drifts from authoritative procurement total', () => {
    const lines = buildRepresentativeChinaBatchLines();
    const authoritative = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    const legacy = legacyUnitTimesQtyTotal(lines);
    assert.equal(authoritative, CHINA_BATCH_PRODUCT_COST_TOTAL);
    assert.notEqual(legacy, authoritative);
    // Production observed drift: SCM 914369.80 vs branch Σ(unit×qty) 914369.18 (−0.62 KGS).
    assert.ok(Math.abs(authoritative - legacy) > 0);
  });

  it('documents production drift magnitude for China batch 914369.80 KGS', () => {
    assert.equal(
      roundDisplayMoney(CHINA_BATCH_PRODUCT_COST_TOTAL - PRODUCTION_LEGACY_DRIFT_KGS),
      914369.18,
    );
  });

  it('proportional FIFO allocation preserves procurement line totals', () => {
    const lines = buildRepresentativeChinaBatchLines();
    assert.equal(aggregateFifoProductCost(lines), CHINA_BATCH_PRODUCT_COST_TOTAL);
  });

  it('procurement movement sync keeps authoritative line total for single shipment', () => {
    const line = buildRepresentativeChinaBatchLines().find(
      (row) =>
        roundDisplayMoney(deriveDisplayUnitCost(row.totalCostKgs, row.quantity) * row.quantity) <
        row.totalCostKgs,
    )!;
    const updates = resolveMovementCostUpdates({
      orderLineFinalUnitCostKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
      orderLineTotalCostKgs: line.totalCostKgs,
      movements: [
        {
          id: 'm1',
          quantity: line.quantity,
          totalCostKgs: line.totalCostKgs,
          unitCostKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
        },
      ],
    });
    assert.equal(updates[0]?.totalCostKgs, line.totalCostKgs);
    assert.notEqual(
      updates[0]?.totalCostKgs,
      roundDisplayMoney(updates[0]!.unitCostKgs * line.quantity),
    );
  });

  it('branch sales aggregate matches procurement total via line cost sums', () => {
    const lines = buildRepresentativeChinaBatchLines();
    const branchAggregate = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(allocateProportionalCost(line.totalCostKgs, line.quantity, line.quantity)),
      ),
    );
    assert.equal(branchAggregate, CHINA_BATCH_PRODUCT_COST_TOTAL);
    assert.notEqual(branchAggregate, legacyUnitTimesQtyTotal(lines));
  });
});
