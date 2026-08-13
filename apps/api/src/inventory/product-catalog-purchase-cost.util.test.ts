/**
 * Product catalog Себестоимость must show the latest received Supply Manager
 * purchase unit landed cost — not oldest FIFO layer, not stale product snapshots.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapProductCatalogPurchaseCost,
  selectLatestReceivedUnitCost,
} from './product-catalog-purchase-cost.util';

describe('product catalog latest received purchase cost', () => {
  it('maps latest received procurement cost to catalog fields', () => {
    const mapped = mapProductCatalogPurchaseCost({
      latest: {
        latestReceivedUnitLandedCost: 13801.15,
        available: true,
        source: 'LATEST_PROCUREMENT_RECEIPT',
        batchId: 'batch-2',
        receivedAt: new Date('2026-04-01T10:00:00.000Z'),
        warehouseId: 'hq-wh',
        procurementGoodsReceivingId: 'recv-2',
      },
    });
    assert.equal(mapped.latestReceivedUnitLandedCost, 13801.15);
    assert.equal(mapped.finalCostKgs, 13801.15);
    assert.equal(mapped.costAvailable, true);
    assert.equal(mapped.costSource, 'LATEST_PROCUREMENT_RECEIPT');
  });

  it('returns null when no completed procurement receipt exists', () => {
    const mapped = mapProductCatalogPurchaseCost({
      latest: {
        latestReceivedUnitLandedCost: 0,
        available: false,
        source: 'NO_RECEIPT',
        batchId: null,
        receivedAt: null,
        warehouseId: null,
        procurementGoodsReceivingId: null,
      },
    });
    assert.equal(mapped.latestReceivedUnitLandedCost, null);
    assert.equal(mapped.finalCostKgs, null);
    assert.equal(mapped.costAvailable, false);
  });

  it('shows latest received purchase cost even when older FIFO layer still has stock', () => {
    const cost = selectLatestReceivedUnitCost([
      {
        id: 'layer-1',
        receivedAt: '2026-03-01T10:00:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
        unitLandedCostKgs: 12500,
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      },
      {
        id: 'layer-2',
        receivedAt: '2026-04-01T10:00:00.000Z',
        createdAt: '2026-04-01T10:00:00.000Z',
        unitLandedCostKgs: 13801.15,
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      },
    ]);
    assert.equal(cost, 13801.15);
  });

  it('ignores non-procurement layers when selecting latest catalog cost', () => {
    const cost = selectLatestReceivedUnitCost([
      {
        id: 'manual',
        receivedAt: '2026-05-01T10:00:00.000Z',
        createdAt: '2026-05-01T10:00:00.000Z',
        unitLandedCostKgs: 3918.7,
        referenceType: 'ADJUSTMENT',
      },
      {
        id: 'procurement',
        receivedAt: '2026-04-01T10:00:00.000Z',
        createdAt: '2026-04-01T10:00:00.000Z',
        unitLandedCostKgs: 13801.15,
        referenceType: 'PROCUREMENT_GOODS_RECEIVING',
      },
    ]);
    assert.equal(cost, 13801.15);
  });
});
