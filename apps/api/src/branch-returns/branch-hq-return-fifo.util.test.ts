import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHqReturnedFifoLayersFromConsumedAllocations,
  hqFifoReferenceTypeForReturnCondition,
  hqStockMovementTypeForReturnCondition,
  isNonSaleableBranchHqReturnCondition,
  previewBranchHqReturnFifoConsumption,
} from './branch-hq-return-fifo.util';

describe('branch hq return fifo cost', () => {
  it('consumes branch FIFO layers oldest-first for return of 7 units = 15000', () => {
    const result = previewBranchHqReturnFifoConsumption(
      [
        {
          batchId: 'A',
          remainingQuantity: 5,
          reservedQuantity: 0,
          unitCostKgs: 2000,
          initialQuantity: 5,
          layerTotalCostKgs: 10000,
          sourceReferenceType: 'HQ_FIFO_LAYER',
          sourceReferenceId: 'hq-a',
        },
        {
          batchId: 'B',
          remainingQuantity: 5,
          reservedQuantity: 0,
          unitCostKgs: 2500,
          initialQuantity: 5,
          layerTotalCostKgs: 12500,
          sourceReferenceType: 'HQ_FIFO_LAYER',
          sourceReferenceId: 'hq-b',
        },
      ],
      7,
    );

    assert.equal(result.allocatedQty, 7);
    assert.equal(result.totalCostKgs, 15000);
    assert.deepEqual(
      result.lines.map((line) => ({
        batchId: line.batchId,
        quantity: line.quantity,
        totalCostKgs: line.totalCostKgs,
      })),
      [
        { batchId: 'A', quantity: 5, totalCostKgs: 10000 },
        { batchId: 'B', quantity: 2, totalCostKgs: 5000 },
      ],
    );
  });

  it('respects reserved quantity when previewing available stock', () => {
    const result = previewBranchHqReturnFifoConsumption(
      [
        {
          batchId: 'A',
          remainingQuantity: 5,
          reservedQuantity: 5,
          unitCostKgs: 2000,
          initialQuantity: 5,
          layerTotalCostKgs: 10000,
        },
        {
          batchId: 'B',
          remainingQuantity: 5,
          reservedQuantity: 0,
          unitCostKgs: 2500,
          initialQuantity: 5,
          layerTotalCostKgs: 12500,
        },
      ],
      3,
    );
    assert.equal(result.allocatedQty, 3);
    assert.equal(result.lines[0]?.batchId, 'B');
    assert.equal(result.totalCostKgs, 7500);
  });

  it('blocks shipment when FIFO cost is missing', () => {
    assert.throws(
      () =>
        previewBranchHqReturnFifoConsumption(
          [
            {
              batchId: 'missing',
              remainingQuantity: 5,
              unitCostKgs: 0,
              initialQuantity: 5,
              layerTotalCostKgs: 0,
            },
          ],
          2,
        ),
      /Missing authoritative FIFO cost/,
    );
  });

  it('builds HQ returned layers preserving per-layer costs for full receipt', () => {
    const layers = buildHqReturnedFifoLayersFromConsumedAllocations(
      [
        {
          id: 'alloc-a',
          fifoBatchId: 'A',
          quantity: 5,
          unitCostKgs: 2000,
          totalCostKgs: 10000,
        },
        {
          id: 'alloc-b',
          fifoBatchId: 'B',
          quantity: 2,
          unitCostKgs: 2500,
          totalCostKgs: 5000,
        },
      ],
      7,
    );
    assert.deepEqual(
      layers.map((line) => ({
        quantity: line.quantity,
        unitCostKgs: line.unitCostKgs,
        totalCostKgs: line.totalCostKgs,
      })),
      [
        { quantity: 5, unitCostKgs: 2000, totalCostKgs: 10000 },
        { quantity: 2, unitCostKgs: 2500, totalCostKgs: 5000 },
      ],
    );
  });

  it('partial receipt only materializes received quantity into HQ layers', () => {
    const layers = buildHqReturnedFifoLayersFromConsumedAllocations(
      [
        {
          id: 'alloc-a',
          fifoBatchId: 'A',
          quantity: 5,
          unitCostKgs: 2000,
          totalCostKgs: 10000,
        },
        {
          id: 'alloc-b',
          fifoBatchId: 'B',
          quantity: 2,
          unitCostKgs: 2500,
          totalCostKgs: 5000,
        },
      ],
      6,
    );
    const totalQty = layers.reduce((sum, line) => sum + line.quantity, 0);
    const totalCost = layers.reduce((sum, line) => sum + line.totalCostKgs, 0);
    assert.equal(totalQty, 6);
    assert.equal(totalCost, 12500);
  });

  it('routes defective/damaged/used away from normal saleable stock markers', () => {
    assert.equal(isNonSaleableBranchHqReturnCondition('NEW'), false);
    assert.equal(isNonSaleableBranchHqReturnCondition('USED'), true);
    assert.equal(isNonSaleableBranchHqReturnCondition('DEFECTIVE'), true);
    assert.equal(isNonSaleableBranchHqReturnCondition('DAMAGED'), true);
    assert.equal(hqStockMovementTypeForReturnCondition('NEW'), 'IN');
    assert.equal(hqStockMovementTypeForReturnCondition('DEFECTIVE'), 'DEFECTIVE_IN');
    assert.equal(hqFifoReferenceTypeForReturnCondition('DAMAGED'), 'BRANCH_HQ_RETURN_DAMAGED');
    assert.equal(hqFifoReferenceTypeForReturnCondition('NEW'), 'BRANCH_HQ_RETURN');
  });
});
