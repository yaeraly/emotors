/**
 * Product catalog Себестоимость must use the shared HQ FIFO active-layer resolver,
 * never Product.finalCostKgs / InventoryBalance.averageCostKgs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapProductCatalogFifoCost,
  selectOldestActiveFifoUnitCost,
} from './product-catalog-fifo-cost.util';

describe('product catalog FIFO cost mapping', () => {
  it('uses active FIFO unit cost instead of Product.finalCostKgs snapshot', () => {
    const mapped = mapProductCatalogFifoCost({
      fifo: {
        costPriceKgs: 1662.97,
        available: true,
        source: 'HQ_FIFO_ACTIVE_LAYER',
        batchId: 'batch-15',
        receivedAt: new Date('2026-03-01T10:00:00.000Z'),
        warehouseId: 'hq-wh',
      },
    });
    assert.equal(mapped.finalCostKgs, 1662.97);
    assert.equal(mapped.currentFifoUnitCost, 1662.97);
    assert.equal(mapped.currentHqFifoUnitCost, 1662.97);
    assert.equal(mapped.costAvailable, true);
    assert.equal(mapped.costSource, 'HQ_FIFO_ACTIVE_LAYER');
  });

  it('returns null when no active HQ FIFO layer exists', () => {
    const mapped = mapProductCatalogFifoCost({
      fifo: {
        costPriceKgs: 0,
        available: false,
        source: 'NO_FIFO_LAYER',
        batchId: null,
        receivedAt: null,
        warehouseId: null,
      },
    });
    assert.equal(mapped.finalCostKgs, null);
    assert.equal(mapped.currentFifoUnitCost, null);
    assert.equal(mapped.costAvailable, false);
  });

  it('displays oldest receipt layer cost while it has remaining quantity', () => {
    const cost = selectOldestActiveFifoUnitCost([
      {
        id: 'layer-1',
        receivedAt: '2026-03-01T10:00:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
        remainingQuantity: 15,
        unitLandedCostKgs: 1662.97,
      },
      {
        id: 'layer-2',
        receivedAt: '2026-03-15T10:00:00.000Z',
        createdAt: '2026-03-15T10:00:00.000Z',
        remainingQuantity: 10,
        unitLandedCostKgs: 1654.2,
      },
    ]);
    assert.equal(cost, 1662.97);
  });

  it('switches to the next receipt layer after the oldest is exhausted', () => {
    const cost = selectOldestActiveFifoUnitCost([
      {
        id: 'layer-1',
        receivedAt: '2026-03-01T10:00:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
        remainingQuantity: 0,
        unitLandedCostKgs: 1662.97,
      },
      {
        id: 'layer-2',
        receivedAt: '2026-03-15T10:00:00.000Z',
        createdAt: '2026-03-15T10:00:00.000Z',
        remainingQuantity: 10,
        unitLandedCostKgs: 1654.2,
      },
    ]);
    assert.equal(cost, 1654.2);
  });

  it('ignores legacy seed layers when real receipt layers exist', () => {
    const cost = selectOldestActiveFifoUnitCost([
      {
        id: 'seed',
        receivedAt: '2026-01-10T10:00:00.000Z',
        createdAt: '2026-01-10T10:00:00.000Z',
        remainingQuantity: 80,
        unitLandedCostKgs: 350,
        isSeed: true,
      },
      {
        id: 'real-1',
        receivedAt: '2026-03-01T10:00:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
        remainingQuantity: 15,
        unitLandedCostKgs: 1662.97,
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      },
    ]);
    assert.equal(cost, 1662.97);
  });

  it('uses strict FIFO oldest layer regardless of reference type', () => {
    const cost = selectOldestActiveFifoUnitCost([
      {
        id: 'manual-old',
        receivedAt: '2026-01-01T10:00:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
        remainingQuantity: 5,
        unitLandedCostKgs: 5000,
        referenceType: 'ADJUSTMENT',
      },
      {
        id: 'procurement',
        receivedAt: '2026-02-01T10:00:00.000Z',
        createdAt: '2026-02-01T10:00:00.000Z',
        remainingQuantity: 20,
        unitLandedCostKgs: 5500,
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      },
    ]);
    assert.equal(cost, 5000);
  });

  it('advances to the next FIFO layer after the oldest batch is depleted', () => {
    const cost = selectOldestActiveFifoUnitCost([
      {
        id: 'batch-1',
        receivedAt: '2026-01-01T10:00:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
        remainingQuantity: 0,
        unitLandedCostKgs: 5000,
      },
      {
        id: 'batch-2',
        receivedAt: '2026-02-01T10:00:00.000Z',
        createdAt: '2026-02-01T10:00:00.000Z',
        remainingQuantity: 20,
        unitLandedCostKgs: 5500,
      },
    ]);
    assert.equal(cost, 5500);
  });
});
