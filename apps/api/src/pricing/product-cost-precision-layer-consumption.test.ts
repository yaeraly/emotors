import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';
import {
  allocateLayerConsumptionCost,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from './product-cost-precision.util';

const CHINA_BATCH_TOTAL = 914369.8;

function buildChinaBatchLines() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_TOTAL);
  return lineTotals.map((totalCostKgs, index) => ({
    batchId: `batch-${index}`,
    totalCostKgs,
    quantity,
  }));
}

describe('allocateLayerConsumptionCost — full layer remainder', () => {
  it('full remaining layer uses exact layer total, not rounded unit×qty', () => {
    const layerTotal = 162317.33;
    const baseQty = 11;
    const consumed = allocateLayerConsumptionCost({
      layerTotalCostKgs: layerTotal,
      layerBaseQuantity: baseQty,
      remainingQuantity: baseQty,
      takeQuantity: baseQty,
    });
    const unitTimesQty = roundDisplayMoney(deriveDisplayUnitCost(layerTotal, baseQty) * baseQty);
    assert.equal(consumed, layerTotal);
    assert.notEqual(consumed, unitTimesQty);
  });

  it('partial layer consumption uses proportional remaining value', () => {
    const layerTotal = 162317.33;
    const baseQty = 11;
    const remaining = 3;
    const consumed = allocateLayerConsumptionCost({
      layerTotalCostKgs: layerTotal,
      layerBaseQuantity: baseQty,
      remainingQuantity: remaining,
      takeQuantity: remaining,
    });
    assert.equal(consumed, roundDisplayMoney((layerTotal / baseQty) * remaining));
  });
});

describe('China batch — FIFO full-layer HQ transfer parity', () => {
  const lines = buildChinaBatchLines();

  it('authoritative shipment product cost sum', () => {
    assert.equal(sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs)), CHINA_BATCH_TOTAL);
  });

  it('FIFO allocation per product matches authoritative line totals', () => {
    const costs = lines.map((line) => {
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
      return result.totalCostKgs;
    });
    assert.equal(sumDisplayMoneyTotals(costs), CHINA_BATCH_TOTAL);
  });

  it('legacy stored unit×qty path drifts from authoritative total', () => {
    const legacyStored = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity),
      ),
    );
    assert.notEqual(legacyStored, CHINA_BATCH_TOTAL);
  });

  it('difference from legacy stored path is not reproduced by FIFO allocation', () => {
    const legacyStored = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity),
      ),
    );
    const fifoTotal = sumDisplayMoneyTotals(
      lines.map((line) =>
        buildFifoAllocationLines(
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
        ).totalCostKgs,
      ),
    );
    assert.equal(fifoTotal, CHINA_BATCH_TOTAL);
    assert.notEqual(fifoTotal, legacyStored);
    assert.equal(roundDisplayMoney(CHINA_BATCH_TOTAL - fifoTotal), 0);
  });
});
