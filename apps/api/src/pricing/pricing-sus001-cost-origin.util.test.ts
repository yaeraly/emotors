/**
 * Reproduce SUS001-style incorrect 407.53 cost vs correct FIFO active layer.
 * Creates two HQ FIFO layers with distinct unit costs whose weighted average is 407.53.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';

function weightedAverage(layers: Array<{ qty: number; unitCost: number }>) {
  const totalQty = layers.reduce((s, l) => s + l.qty, 0);
  const totalValue = layers.reduce((s, l) => s + l.qty * l.unitCost, 0);
  return Math.round((totalValue / totalQty + Number.EPSILON) * 100) / 100;
}

function selectActiveFifoUnitCost(
  layers: Array<{ remainingQuantity: number; unitCostKgs: number; receivedAt: string }>,
) {
  const active = [...layers]
    .filter((l) => l.remainingQuantity > 0 && l.unitCostKgs > 0)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  return active[0]?.unitCostKgs ?? null;
}

describe('SUS001-style cost 407.53 origin', () => {
  it('407.53 is the weighted-average inventory valuation, not a real FIFO layer unit cost', () => {
    // Two China shipments with distinct landed unit costs.
    const layer1 = { qty: 80, unitCost: 350 };
    const layer2 = { qty: 120, unitCost: 445.88 };
    // (80*350 + 120*445.88) / 200 = (28000 + 53505.6) / 200 = 407.528 ≈ 407.53
    const avg = weightedAverage([layer1, layer2]);
    assert.equal(avg, 407.53);

    const fifoDisplay = selectActiveFifoUnitCost([
      { remainingQuantity: 80, unitCostKgs: layer1.unitCost, receivedAt: '2026-01-01' },
      { remainingQuantity: 120, unitCostKgs: layer2.unitCost, receivedAt: '2026-02-01' },
    ]);
    assert.equal(fifoDisplay, 350);
    assert.notEqual(fifoDisplay, 407.53);
  });

  it('unit landed cost must use received quantity, not combined warehouse quantity', () => {
    // Bug pattern: allocate total of one shipment across both shipments' qty.
    const shipment1Total = 28000; // 80 * 350
    const wrongCombinedQty = 200; // both shipments
    const wrongUnit = Math.round((shipment1Total / wrongCombinedQty + Number.EPSILON) * 100) / 100;
    assert.equal(wrongUnit, 140);

    const correct = resolveUnitCostFromInventoryLayer({
      quantity: 80,
      totalCostKgs: shipment1Total,
      unitCostKgs: 99999,
    });
    assert.equal(correct, 350);
  });

  it('does not treat inventory average as an active FIFO layer cost', () => {
    const inventoryAverageCostKgs = 407.53;
    const layers = [
      { remainingQuantity: 50, unitCostKgs: 390.1, receivedAt: '2026-03-01' },
      { remainingQuantity: 50, unitCostKgs: 425, receivedAt: '2026-04-01' },
    ];
    const active = selectActiveFifoUnitCost(layers);
    assert.equal(active, 390.1);
    assert.notEqual(active, inventoryAverageCostKgs);
  });
});
