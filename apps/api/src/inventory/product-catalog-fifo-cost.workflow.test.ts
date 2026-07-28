/**
 * Regression: product catalog cost follows oldest active FIFO layer landed unit cost.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  mapProductCatalogFifoCost,
  resolveOldestActiveFifoCatalogUnitCost,
  simulateFifoCatalogConsumption,
  type FifoCatalogLayerInput,
} from './product-catalog-fifo-cost.util';
import { resolveAuthoritativeFifoLayerUnitCost } from '../pricing/pricing-fifo-unit-cost.util';
import { deriveDisplayUnitCost, roundDisplayMoney } from '../pricing/product-cost-precision.util';

function buildTwoBatchLayers(): FifoCatalogLayerInput[] {
  return [
    {
      id: 'batch-1',
      receivedAt: '2026-01-01T10:00:00.000Z',
      createdAt: '2026-01-01T10:00:00.000Z',
      remainingQuantity: 10,
      initialQuantity: 10,
      batchUnitCostKgs: 2000,
      movementTotalCostKgs: 20000,
      movementQuantity: 10,
    },
    {
      id: 'batch-2',
      receivedAt: '2026-02-01T10:00:00.000Z',
      createdAt: '2026-02-01T10:00:00.000Z',
      remainingQuantity: 10,
      initialQuantity: 10,
      batchUnitCostKgs: 2500,
      movementTotalCostKgs: 25000,
      movementQuantity: 10,
    },
  ];
}

function catalogCostFromLayers(layers: FifoCatalogLayerInput[]) {
  const resolved = resolveOldestActiveFifoCatalogUnitCost(layers);
  return mapProductCatalogFifoCost({
    fifo: {
      costPriceKgs: resolved.unitCostKgs ?? 0,
      available: resolved.unitCostKgs != null && resolved.unitCostKgs > 0,
      source: resolved.unitCostKgs != null ? 'HQ_FIFO_ACTIVE_LAYER' : 'NO_FIFO_LAYER',
      batchId: resolved.batchId,
      receivedAt: new Date('2026-01-01T10:00:00.000Z'),
      warehouseId: 'hq-wh',
    },
  }).currentFifoUnitCost;
}

describe('product catalog FIFO cost workflow', () => {
  it('initial catalog cost uses oldest batch (2000 KGS)', () => {
    const cost = catalogCostFromLayers(buildTwoBatchLayers());
    assert.equal(cost, 2000);
  });

  it('after consuming 5 from batch 1, catalog cost remains 2000 KGS', () => {
    const afterPartial = simulateFifoCatalogConsumption(buildTwoBatchLayers(), 5);
    assert.equal(afterPartial.find((l) => l.id === 'batch-1')?.remainingQuantity, 5);
    assert.equal(catalogCostFromLayers(afterPartial), 2000);
  });

  it('after batch 1 is exhausted, catalog cost switches to batch 2 (2500 KGS)', () => {
    const afterFull = simulateFifoCatalogConsumption(buildTwoBatchLayers(), 10);
    assert.equal(afterFull.find((l) => l.id === 'batch-1')?.remainingQuantity, 0);
    assert.equal(catalogCostFromLayers(afterFull), 2500);
  });

  it('never uses weighted average between active layers', () => {
    const layers = buildTwoBatchLayers();
    const cost = catalogCostFromLayers(layers);
    assert.notEqual(cost, 2250);
    assert.equal(cost, 2000);
  });

  it('derives unit cost from movement landed total (CNY conversion + import expenses)', () => {
    const cnyPurchaseKgs = roundDisplayMoney(new Prisma.Decimal(100).mul(12.5));
    const importExpensesKgs = 750;
    const totalLandedKgs = roundDisplayMoney(cnyPurchaseKgs + importExpensesKgs);
    const quantity = 10;

    const unitFromTotal = resolveAuthoritativeFifoLayerUnitCost({
      initialQuantity: quantity,
      batchUnitCostKgs: 0,
      movementTotalCostKgs: totalLandedKgs,
      movementQuantity: quantity,
    });

    assert.equal(cnyPurchaseKgs, 1250);
    assert.equal(totalLandedKgs, 2000);
    assert.equal(unitFromTotal, deriveDisplayUnitCost(totalLandedKgs, quantity));
    assert.equal(unitFromTotal, 200);
  });

  it('prefers authoritative movement total over stale batch.unitCostKgs snapshot', () => {
    const layers: FifoCatalogLayerInput[] = [
      {
        id: 'batch-stale',
        receivedAt: '2026-01-01T10:00:00.000Z',
        createdAt: '2026-01-01T10:00:00.000Z',
        remainingQuantity: 10,
        initialQuantity: 10,
        batchUnitCostKgs: 407.53,
        movementTotalCostKgs: 20000,
        movementQuantity: 10,
      },
    ];

    const resolved = resolveOldestActiveFifoCatalogUnitCost(layers);
    assert.equal(resolved.unitCostKgs, 2000);
    assert.notEqual(resolved.unitCostKgs, 407.53);
  });

  it('maps resolver output to catalog API fields', () => {
    const mapped = mapProductCatalogFifoCost({
      fifo: {
        costPriceKgs: 2000,
        available: true,
        source: 'HQ_FIFO_ACTIVE_LAYER',
        batchId: 'batch-1',
        receivedAt: new Date('2026-01-01T10:00:00.000Z'),
        warehouseId: 'hq-wh',
      },
    });
    assert.equal(mapped.currentFifoUnitCost, 2000);
    assert.equal(mapped.finalCostKgs, 2000);
    assert.equal(mapped.costSource, 'HQ_FIFO_ACTIVE_LAYER');
  });
});
