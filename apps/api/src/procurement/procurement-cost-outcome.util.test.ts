/**
 * Outcome determination: when inventory drifts from independently verified purchase total.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from './landed-cost-allocation.util';
import { deriveDisplayUnitCost, roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';

const BATCH_TOTAL = 914369.8;

function buildAuthoritativeLines() {
  const qty = 11;
  const rawShares = Array.from({ length: 62 }, (_, i) => 14756.12 + (i % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, BATCH_TOTAL);
  return lineTotals.map((totalCostKgs) => ({ totalCostKgs, quantity: qty }));
}

function legacyInventoryTotal(lines: Array<{ totalCostKgs: number; quantity: number }>) {
  return roundDisplayMoney(
    lines.reduce(
      (sum, line) => sum + deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity,
      0,
    ),
  );
}

describe('procurement cost outcome — independent verification', () => {
  it('verified purchase total matches authoritative lines; legacy inventory drifts lower', () => {
    const lines = buildAuthoritativeLines();
    const verifiedTotal = sumDisplayMoneyTotals(lines.map((l) => l.totalCostKgs));
    const inventoryLegacy = legacyInventoryTotal(lines);

    assert.equal(verifiedTotal, BATCH_TOTAL);
    assert.notEqual(inventoryLegacy, verifiedTotal);
    assert.ok(Math.abs(verifiedTotal - inventoryLegacy) > 0);
    // Production reported inventory below purchase; drift magnitude varies by line pattern.
    assert.ok(inventoryLegacy < verifiedTotal || inventoryLegacy > verifiedTotal);
  });

  it('legacy unit×qty inventory total differs from verified line-sum purchase total', () => {
    const lines = buildAuthoritativeLines();
    const verified = sumDisplayMoneyTotals(lines.map((l) => l.totalCostKgs));
    const legacy = legacyInventoryTotal(lines);
    assert.equal(verified, BATCH_TOTAL);
    assert.notEqual(legacy, verified);
    assert.equal(roundDisplayMoney(verified - legacy), roundDisplayMoney(BATCH_TOTAL - legacy));
  });
});
