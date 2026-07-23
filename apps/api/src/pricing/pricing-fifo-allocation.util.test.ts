import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';

describe('buildFifoAllocationLines — multi-layer branch order', () => {
  it('Scenario 3: allocates across layers with per-layer 20% markup', () => {
    const result = buildFifoAllocationLines(
      [
        { batchId: 'L1', remainingQuantity: 3, unitCostKgs: 5000 },
        { batchId: 'L2', remainingQuantity: 10, unitCostKgs: 6000 },
      ],
      5,
      { markupPercent: 20, branchType: 'FRANCHISE', subtractReserved: true },
    );

    assert.equal(result.allocatedQty, 5);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].quantity, 3);
    assert.equal(result.lines[0].unitCostKgs, 5000);
    assert.equal(result.lines[0].unitPriceKgs, 6000);
    assert.equal(result.lines[1].quantity, 2);
    assert.equal(result.lines[1].unitCostKgs, 6000);
    assert.equal(result.lines[1].unitPriceKgs, 7200);
    assert.equal(result.totalCostKgs, 27000);
    assert.equal(result.totalPriceKgs, 32400);
    assert.equal(result.profitKgs, 5400);
    assert.equal(result.activeUnitCostKgs, 5000);
  });

  it('respects reserved quantity so parallel orders cannot oversell', () => {
    const result = buildFifoAllocationLines(
      [
        { batchId: 'L1', remainingQuantity: 3, reservedQuantity: 3, unitCostKgs: 5000 },
        { batchId: 'L2', remainingQuantity: 10, reservedQuantity: 0, unitCostKgs: 6000 },
      ],
      5,
      { markupPercent: 20, branchType: 'FRANCHISE', subtractReserved: true },
    );
    assert.equal(result.lines[0].batchId, 'L2');
    assert.equal(result.lines[0].quantity, 5);
    assert.equal(result.activeUnitCostKgs, 6000);
  });

  it('never averages costs before markup', () => {
    const result = buildFifoAllocationLines(
      [
        { batchId: 'L1', remainingQuantity: 3, unitCostKgs: 5000 },
        { batchId: 'L2', remainingQuantity: 2, unitCostKgs: 6000 },
      ],
      5,
      { markupPercent: 20, branchType: 'FRANCHISE' },
    );
    // Average cost would be 5400 → price 6480; per-layer prices must differ.
    assert.notEqual(result.lines[0].unitPriceKgs, result.lines[1].unitPriceKgs);
    assert.equal(result.totalPriceKgs, 3 * 6000 + 2 * 7200);
  });
});
