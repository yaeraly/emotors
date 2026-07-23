import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Documents FIFO dynamic layer selection for Branch Sales pricing.
 * Mirrors PricingFifoService.getLatestHqCostPrice selection order:
 * oldest remaining HQ layer first; skip depleted layers automatically.
 */
function selectActiveFifoUnitCost(
  layers: Array<{ remainingQuantity: number; unitCostKgs: number; receivedAt: string }>,
) {
  const active = [...layers]
    .filter((layer) => layer.remainingQuantity > 0 && layer.unitCostKgs > 0)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  return active[0]?.unitCostKgs ?? null;
}

describe('FIFO dynamic pricing layer selection', () => {
  it('uses first layer while it still has stock', () => {
    const cost = selectActiveFifoUnitCost([
      { remainingQuantity: 10, unitCostKgs: 5000, receivedAt: '2026-01-01' },
      { remainingQuantity: 10, unitCostKgs: 6000, receivedAt: '2026-02-01' },
    ]);
    assert.equal(cost, 5000);
  });

  it('switches to second layer when first is depleted', () => {
    const cost = selectActiveFifoUnitCost([
      { remainingQuantity: 0, unitCostKgs: 5000, receivedAt: '2026-01-01' },
      { remainingQuantity: 10, unitCostKgs: 6000, receivedAt: '2026-02-01' },
    ]);
    assert.equal(cost, 6000);
  });

  it('never averages multiple layers', () => {
    const cost = selectActiveFifoUnitCost([
      { remainingQuantity: 5, unitCostKgs: 5000, receivedAt: '2026-01-01' },
      { remainingQuantity: 5, unitCostKgs: 6000, receivedAt: '2026-02-01' },
    ]);
    assert.equal(cost, 5000);
    assert.notEqual(cost, 5500);
  });

  it('returns null when no FIFO layer remains', () => {
    const cost = selectActiveFifoUnitCost([
      { remainingQuantity: 0, unitCostKgs: 5000, receivedAt: '2026-01-01' },
      { remainingQuantity: 0, unitCostKgs: 6000, receivedAt: '2026-02-01' },
    ]);
    assert.equal(cost, null);
  });
});
