import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import {
  BRANCH_ORDER_COST_MISMATCH_MESSAGE,
  compareAuthoritativeCostTotals,
  reconcileBranchTransferCost,
} from './cost-reconciliation.util';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';
import {
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

describe('cost-reconciliation.util', () => {
  it('detects non-zero difference between authoritative totals', () => {
    const result = compareAuthoritativeCostTotals(CHINA_BATCH_TOTAL, 914368.98, 'branch order');
    assert.equal(result.ok, false);
    assert.equal(result.differenceKgs, -0.82);
  });

  it('passes when totals match exactly', () => {
    const result = compareAuthoritativeCostTotals(CHINA_BATCH_TOTAL, CHINA_BATCH_TOTAL, 'HQ inventory');
    assert.equal(result.ok, true);
  });

  it('reconcileBranchTransferCost blocks 0.82 drift', () => {
    const result = reconcileBranchTransferCost([CHINA_BATCH_TOTAL], 914368.98, 'branch transfer');
    assert.equal(result.ok, false);
    assert.equal(result.differenceKgs, -0.82);
  });

  it('exports Kyrgyz reconciliation message', () => {
    assert.match(BRANCH_ORDER_COST_MISMATCH_MESSAGE, /FIFO партиялары менен дал келбейт/);
  });
});

describe('China batch branch transfer parity', () => {
  const lines = buildChinaBatchLines();

  it('shipment landed cost remains 914369.80', () => {
    assert.equal(sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs)), CHINA_BATCH_TOTAL);
  });

  it('FIFO full-layer transfer preserves each line total', () => {
    let transferTotal = 0;
    for (const line of lines) {
      const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
      const allocation = buildFifoAllocationLines(
        [
          {
            batchId: line.batchId,
            remainingQuantity: line.quantity,
            unitCostKgs: unit,
            layerTotalCostKgs: line.totalCostKgs,
            layerBaseQuantity: line.quantity,
          },
        ],
        line.quantity,
        { markupPercent: 0, branchType: 'HQ_BRANCH', subtractReserved: false },
      );
      assert.equal(allocation.totalCostKgs, line.totalCostKgs);
      transferTotal += allocation.totalCostKgs;
    }
    assert.equal(roundDisplayMoney(transferTotal), CHINA_BATCH_TOTAL);
  });

  it('order total from line sums matches shipment — not unit×qty', () => {
    const authoritative = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    const unitTimesQtyTotal = roundDisplayMoney(
      lines.reduce((sum, line) => {
        const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
        return sum + unit * line.quantity;
      }, 0),
    );
    assert.equal(authoritative, CHINA_BATCH_TOTAL);
    assert.notEqual(authoritative, unitTimesQtyTotal);
    const reconciliation = compareAuthoritativeCostTotals(CHINA_BATCH_TOTAL, authoritative, 'branch order transfer');
    assert.equal(reconciliation.ok, true);
  });

  it('sumDisplayMoneyTotals preserves china batch total', () => {
    const costs = lines.map((line) => line.totalCostKgs);
    assert.equal(sumDisplayMoneyTotals(costs), CHINA_BATCH_TOTAL);
  });
});
