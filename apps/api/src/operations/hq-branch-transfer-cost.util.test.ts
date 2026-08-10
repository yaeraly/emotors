import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { allocateProportionalCost } from '../pricing/product-cost-precision.util';
import {
  deriveHqBranchTransferDisplayUnitCost,
  measureUnitTimesQtyDriftKgs,
  resolveHqBranchTransferLineCostKgs,
  sumHqBranchTransferLineCosts,
} from './hq-branch-transfer-cost.util';

const HQ_BATCH_1_TOTAL = 914369.8;
const HQ_BATCH_2_TOTAL = 822036.2;

describe('HQ Branch transfer cost — Decimal authoritative path', () => {
  it('Test 1 — authoritative sum 914369.80 must not drift via display unit × qty', () => {
    const quantity = 11;
    const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
    const lineCosts = distributeRoundedAmounts(rawShares, HQ_BATCH_1_TOTAL);
    const lines = lineCosts.map((transferLineCostKgs) => ({
      transferLineCostKgs,
      quantity,
    }));
    const drift = measureUnitTimesQtyDriftKgs(lines);
    assert.equal(drift.authoritativeSum, HQ_BATCH_1_TOTAL);
    assert.notEqual(drift.unitTimesQtySum, HQ_BATCH_1_TOTAL);
    assert.ok(Math.abs(drift.driftKgs) > 0);
    assert.equal(
      sumHqBranchTransferLineCosts(lines.map((line) => line.transferLineCostKgs)),
      HQ_BATCH_1_TOTAL,
    );
  });

  it('Test 1b — batch 2 authoritative sum 822036.20 is preserved (not +0.19 unit×qty drift)', () => {
    const quantity = 10;
    const rawShares = Array.from({ length: 55 }, (_, index) => 12000.45 + (index % 13) * 0.27);
    const lineCosts = distributeRoundedAmounts(rawShares, HQ_BATCH_2_TOTAL);
    const lines = lineCosts.map((transferLineCostKgs) => ({
      transferLineCostKgs,
      quantity,
    }));
    const drift = measureUnitTimesQtyDriftKgs(lines);
    assert.equal(drift.authoritativeSum, HQ_BATCH_2_TOTAL);
    assert.notEqual(drift.unitTimesQtySum, HQ_BATCH_2_TOTAL);
    assert.equal(
      sumHqBranchTransferLineCosts(lines.map((line) => line.transferLineCostKgs)),
      HQ_BATCH_2_TOTAL,
    );
  });

  it('Test 2 — high-precision raw unit: line cost from proportional Decimal, not displayUnit × qty', () => {
    const rawUnit = new Prisma.Decimal('123.456789123');
    const quantity = 17;
    const layerTotal = rawUnit.mul(quantity);
    const lineCost = resolveHqBranchTransferLineCostKgs({ fifoLineCostKgs: layerTotal });
    const displayUnit = deriveHqBranchTransferDisplayUnitCost(lineCost, quantity);
    const forbidden = displayUnit * quantity;
    assert.equal(lineCost, layerTotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber());
    assert.notEqual(lineCost, forbidden);
    assert.equal(
      resolveHqBranchTransferLineCostKgs({ fifoLineCostKgs: layerTotal }),
      lineCost,
    );
  });

  it('Test 3 — many fractional product lines: SUM(line costs) = SUM(source) exactly', () => {
    const quantities = [3, 7, 11, 5, 13, 2, 9, 4, 6, 8];
    const layerTotals = quantities.map((qty, index) =>
      allocateProportionalCost(10000 + index * 123.456789, 10, qty),
    );
    const authoritative = sumHqBranchTransferLineCosts(layerTotals);
    const lines = layerTotals.map((transferLineCostKgs, index) => ({
      transferLineCostKgs,
      quantity: quantities[index]!,
    }));
    assert.equal(sumHqBranchTransferLineCosts(lines.map((l) => l.transferLineCostKgs)), authoritative);
    const drift = measureUnitTimesQtyDriftKgs(lines);
    assert.equal(drift.authoritativeSum, authoritative);
  });

  it('forbids using display unit × quantity as authoritative line cost', () => {
    const transferLineCostKgs = 162317.33;
    const quantity = 11;
    const displayUnit = deriveHqBranchTransferDisplayUnitCost(transferLineCostKgs, quantity);
    const authoritative = resolveHqBranchTransferLineCostKgs({ fifoLineCostKgs: transferLineCostKgs });
    assert.equal(authoritative, transferLineCostKgs);
    assert.notEqual(authoritative, displayUnit * quantity);
  });
});
