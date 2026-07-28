/**
 * Regression tests: GEN001 13801.15 vs stale 6129.40, FIFO layer transitions.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  resolveOldestActiveFifoCatalogUnitCost,
  simulateFifoCatalogConsumption,
  type FifoCatalogLayerInput,
} from './product-catalog-fifo-cost.util';
import {
  resolveProcurementLayerUnitCostFromSources,
  resolveCurrentProductCatalogUnitCost,
} from './product-catalog-current-cost.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

const GEN001_LANDED = 13801.15;
const GEN001_STALE = 6129.4;
const BATCH2_LANDED = 15000;

describe('product catalog current cost — GEN001 stale movement regression', () => {
  it('Test 1: prefers finalized snapshot over stale movement/batch purchase-only cost', () => {
    const unit = resolveProcurementLayerUnitCostFromSources({
      snapshotUnitLandedCostKgs: GEN001_LANDED,
      orderLineTotalCostKgs: GEN001_LANDED * 10,
      orderLineQuantity: 10,
      orderLineFinalUnitCostKgs: GEN001_STALE,
      receivedQuantity: 10,
      movementTotalCostKgs: GEN001_STALE * 10,
      movementQuantity: 10,
      movementUnitCostKgs: GEN001_STALE,
      batchUnitCostKgs: GEN001_STALE,
    });
    assert.equal(unit, GEN001_LANDED);
    assert.notEqual(unit, GEN001_STALE);
  });

  it('Test 1b: catalog API mapping from authoritative resolver output', () => {
    const unit = resolveProcurementLayerUnitCostFromSources({
      snapshotUnitLandedCostKgs: GEN001_LANDED,
      receivedQuantity: 10,
      movementTotalCostKgs: GEN001_STALE * 10,
      batchUnitCostKgs: GEN001_STALE,
    });
    assert.equal(unit, GEN001_LANDED);
  });
});

function gen001Layers(
  batch1Remaining: number,
  batch2Remaining = 10,
): FifoCatalogLayerInput[] {
  return [
    {
      id: 'gen-batch-1',
      receivedAt: '2026-01-01T10:00:00.000Z',
      createdAt: '2026-01-01T10:00:00.000Z',
      remainingQuantity: batch1Remaining,
      initialQuantity: 10,
      batchUnitCostKgs: GEN001_STALE,
      movementTotalCostKgs: GEN001_LANDED * 10,
      movementQuantity: 10,
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
    },
    {
      id: 'gen-batch-2',
      receivedAt: '2026-02-01T10:00:00.000Z',
      createdAt: '2026-02-01T10:00:00.000Z',
      remainingQuantity: batch2Remaining,
      initialQuantity: 10,
      batchUnitCostKgs: BATCH2_LANDED,
      movementTotalCostKgs: BATCH2_LANDED * 10,
      movementQuantity: 10,
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
    },
  ];
}

function catalogUnitFromLayersWithSnapshot(layers: FifoCatalogLayerInput[]) {
  const oldest = layers
    .filter((l) => l.remainingQuantity > 0)
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())[0];
  if (!oldest) return null;
  return resolveProcurementLayerUnitCostFromSources({
    snapshotUnitLandedCostKgs:
      oldest.id === 'gen-batch-1' ? GEN001_LANDED : BATCH2_LANDED,
    receivedQuantity: oldest.initialQuantity,
    movementTotalCostKgs: oldest.movementTotalCostKgs,
    movementQuantity: oldest.movementQuantity,
    batchUnitCostKgs: oldest.batchUnitCostKgs,
  });
}

describe('product catalog FIFO transition — GEN001', () => {
  it('Test 2a: Batch 1 remaining 10 → directory cost = 13,801.15', () => {
    const cost = catalogUnitFromLayersWithSnapshot(gen001Layers(10));
    assert.equal(cost, GEN001_LANDED);
  });

  it('Test 2b: Batch 1 remaining 1 → directory cost = 13,801.15', () => {
    const cost = catalogUnitFromLayersWithSnapshot(gen001Layers(1));
    assert.equal(cost, GEN001_LANDED);
  });

  it('Test 2c: Batch 1 remaining 0 → directory cost = 15,000.00', () => {
    const cost = catalogUnitFromLayersWithSnapshot(gen001Layers(0));
    assert.equal(cost, BATCH2_LANDED);
  });

  it('Test 2d: after partial consumption, oldest layer cost unchanged', () => {
    const afterFive = simulateFifoCatalogConsumption(gen001Layers(10), 5);
    assert.equal(afterFive.find((l) => l.id === 'gen-batch-1')?.remainingQuantity, 5);
    const cost = catalogUnitFromLayersWithSnapshot(afterFive);
    assert.equal(cost, GEN001_LANDED);
  });
});

describe('product catalog — multiple products (Test 3)', () => {
  const products = [
    { sku: 'GEN001', landed: 13801.15, stale: 6129.4 },
    { sku: 'MT001', landed: 5817.44, stale: 2500 },
    { sku: 'SUS001', landed: 1636.13, stale: 407.53 },
  ];

  for (const product of products) {
    it(`${product.sku}: snapshot landed cost beats stale movement cost`, () => {
      const unit = resolveProcurementLayerUnitCostFromSources({
        snapshotUnitLandedCostKgs: product.landed,
        receivedQuantity: 10,
        movementTotalCostKgs: product.stale * 10,
        batchUnitCostKgs: product.stale,
      });
      assert.equal(unit, product.landed);
    });
  }
});

describe('product catalog — CNY conversion + import expenses in landed unit', () => {
  it('includes allocated import costs in per-unit landed cost', () => {
    const cnyPurchaseKgs = roundDisplayMoney(new Prisma.Decimal(100).mul(12.5));
    const importKgs = 750;
    const totalLanded = roundDisplayMoney(cnyPurchaseKgs + importKgs);
    const unit = resolveProcurementLayerUnitCostFromSources({
      snapshotUnitLandedCostKgs: roundDisplayMoney(totalLanded / 10),
      orderLineTotalCostKgs: totalLanded,
      orderLineQuantity: 10,
      receivedQuantity: 10,
      movementTotalCostKgs: cnyPurchaseKgs,
      batchUnitCostKgs: cnyPurchaseKgs / 10,
    });
    assert.equal(unit, 200);
    assert.notEqual(unit, roundDisplayMoney(cnyPurchaseKgs / 10));
  });
});

describe('product catalog — system consistency (Test 4)', () => {
  it('in-memory oldest layer selection matches procurement authoritative unit', () => {
    const layers = gen001Layers(10);
    const oldestId = resolveOldestActiveFifoCatalogUnitCost(layers).batchId;
    assert.equal(oldestId, 'gen-batch-1');
    const catalogUnit = catalogUnitFromLayersWithSnapshot(layers);
    assert.equal(catalogUnit, GEN001_LANDED);
  });
});

describe('resolveCurrentProductCatalogUnitCost', () => {
  it('exports authoritative resolver for inventory API', () => {
    assert.equal(typeof resolveCurrentProductCatalogUnitCost, 'function');
  });
});
