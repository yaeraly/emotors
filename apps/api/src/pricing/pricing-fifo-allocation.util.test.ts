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

  it('HQ branch transfer uses exact FIFO cost without markup or ROUNDUP', () => {
    const result = buildFifoAllocationLines(
      [{ batchId: 'L1', remainingQuantity: 5, unitCostKgs: 1234 }],
      3,
      { markupPercent: 20, branchType: 'HQ_BRANCH', subtractReserved: true },
    );
    assert.equal(result.lines[0].unitCostKgs, 1234);
    assert.equal(result.lines[0].unitPriceKgs, 1234);
    assert.equal(result.totalPriceKgs, 3702);
    assert.equal(result.profitKgs, 0);
  });

  it('HQ branch 3 pcs totaling 100.00 keeps exact layer remainder', () => {
    const result = buildFifoAllocationLines(
      [
        {
          batchId: 'L1',
          remainingQuantity: 3,
          unitCostKgs: 33.33,
          layerTotalCostKgs: 100,
          layerBaseQuantity: 3,
        },
      ],
      3,
      { markupPercent: 20, branchType: 'HQ_BRANCH' },
    );
    assert.equal(result.totalCostKgs, 100);
    assert.equal(result.totalPriceKgs, 100);
    assert.equal(result.profitKgs, 0);
  });

  it('multi-layer consume keeps each layer remainder, no cross-layer average', () => {
    const result = buildFifoAllocationLines(
      [
        {
          batchId: 'A',
          remainingQuantity: 5,
          unitCostKgs: 20,
          layerTotalCostKgs: 100,
          layerBaseQuantity: 5,
        },
        {
          batchId: 'B',
          remainingQuantity: 7,
          unitCostKgs: 10.01,
          layerTotalCostKgs: 70.07,
          layerBaseQuantity: 7,
        },
      ],
      12,
      { markupPercent: 0, branchType: 'HQ_BRANCH' },
    );
    assert.equal(result.lines[0]!.totalCostKgs, 100);
    assert.equal(result.lines[1]!.totalCostKgs, 70.07);
    assert.equal(result.totalCostKgs, 170.07);
    assert.equal(result.profitKgs, 0);
  });
});
