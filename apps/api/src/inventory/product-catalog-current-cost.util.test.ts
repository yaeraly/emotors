/**
 * Regression tests: unit-cost precision (TRA002 1944.17 vs 1944.23 drift).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  resolveStoredFifoCatalogUnitCostFromSources,
  resolveCurrentProductCatalogUnitCost,
} from './product-catalog-current-cost.util';
import {
  resolveOldestActiveFifoCatalogUnitCost,
  simulateFifoCatalogConsumption,
  type FifoCatalogLayerInput,
} from './product-catalog-fifo-cost.util';
import { resolveMovementCostUpdates } from '../procurement/landed-cost-sync-movements.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
} from '../pricing/product-cost-precision.util';

const TRA002_UNIT = 1944.17;
const TRA002_DRIFT_UNIT = 1944.23;
const BATCH2_UNIT = 2100.35;

describe('TRA002 — Редуктор 20 зуб 5 кг unit cost precision', () => {
  it('Test 1: purchase costing unit 1944.17 beats total/qty drift 1944.23', () => {
    const derivedFromRoundedTotal = deriveDisplayUnitCost(19442.3, 10);
    assert.equal(derivedFromRoundedTotal, TRA002_DRIFT_UNIT);

    const catalogUnit = resolveStoredFifoCatalogUnitCostFromSources({
      snapshotUnitLandedCostKgs: TRA002_UNIT,
      orderLineFinalUnitCostKgs: TRA002_UNIT,
      batchUnitCostKgs: TRA002_DRIFT_UNIT,
      movementUnitCostKgs: TRA002_DRIFT_UNIT,
    });

    assert.equal(catalogUnit, TRA002_UNIT);
    assert.notEqual(catalogUnit, TRA002_DRIFT_UNIT);
    assert.equal(roundDisplayMoney(catalogUnit - TRA002_UNIT), 0);
  });

  it('Test 2: no recalculation drift — exact stored unit returned', () => {
    const stored = resolveStoredFifoCatalogUnitCostFromSources({
      batchUnitCostKgs: TRA002_UNIT,
      movementUnitCostKgs: TRA002_DRIFT_UNIT,
    });
    assert.equal(stored, TRA002_UNIT);
    assert.equal(roundDisplayMoney(stored - TRA002_UNIT), 0);
  });

  it('movement sync uses authoritative finalCostKgs, not total÷qty', () => {
    const updates = resolveMovementCostUpdates({
      orderLineFinalUnitCostKgs: TRA002_UNIT,
      orderLineTotalCostKgs: 19441.7,
      movements: [{ id: 'm1', quantity: 10, totalCostKgs: 19442.3, unitCostKgs: TRA002_DRIFT_UNIT }],
    });
    assert.equal(updates[0]?.unitCostKgs, TRA002_UNIT);
    assert.notEqual(updates[0]?.unitCostKgs, TRA002_DRIFT_UNIT);
  });
});

function tra002Layers(batch1Remaining: number, batch2Remaining = 10): FifoCatalogLayerInput[] {
  return [
    {
      id: 'tra-batch-1',
      receivedAt: '2026-01-01T10:00:00.000Z',
      createdAt: '2026-01-01T10:00:00.000Z',
      remainingQuantity: batch1Remaining,
      initialQuantity: 10,
      batchUnitCostKgs: TRA002_UNIT,
      movementTotalCostKgs: TRA002_UNIT * 10,
      movementQuantity: 10,
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
    },
    {
      id: 'tra-batch-2',
      receivedAt: '2026-02-01T10:00:00.000Z',
      createdAt: '2026-02-01T10:00:00.000Z',
      remainingQuantity: batch2Remaining,
      initialQuantity: 10,
      batchUnitCostKgs: BATCH2_UNIT,
      movementTotalCostKgs: BATCH2_UNIT * 10,
      movementQuantity: 10,
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
    },
  ];
}

describe('TRA002 — FIFO transition (Test 3)', () => {
  it('Batch 1 remaining > 0 → 1944.17', () => {
    const unit = resolveStoredFifoCatalogUnitCostFromSources({
      batchUnitCostKgs: TRA002_UNIT,
    });
    assert.equal(unit, TRA002_UNIT);
  });

  it('Batch 1 remaining 1 → still 1944.17', () => {
    const layers = tra002Layers(1);
    const oldest = resolveOldestActiveFifoCatalogUnitCost(layers);
    assert.equal(
      resolveStoredFifoCatalogUnitCostFromSources({ batchUnitCostKgs: oldest.unitCostKgs }),
      TRA002_UNIT,
    );
  });

  it('Batch 1 remaining 0 → 2100.35', () => {
    const layers = tra002Layers(0);
    const oldest = resolveOldestActiveFifoCatalogUnitCost(layers);
    assert.equal(oldest.unitCostKgs, BATCH2_UNIT);
  });

  it('after partial sale, oldest layer unit unchanged', () => {
    const afterFive = simulateFifoCatalogConsumption(tra002Layers(10), 5);
    const oldest = resolveOldestActiveFifoCatalogUnitCost(afterFive);
    assert.equal(
      resolveStoredFifoCatalogUnitCostFromSources({ batchUnitCostKgs: oldest.unitCostKgs }),
      TRA002_UNIT,
    );
  });
});

describe('multiple products — stored unit parity (Test 4)', () => {
  const products = [
    { sku: 'TRA002', unit: 1944.17, drift: 1944.23 },
    { sku: 'GEN001', unit: 13801.15, drift: 6129.4 },
    { sku: 'SUS001', unit: 1636.13, drift: 407.53 },
  ];

  for (const row of products) {
    it(`${row.sku}: snapshot unit matches catalog without total÷qty`, () => {
      const unit = resolveStoredFifoCatalogUnitCostFromSources({
        snapshotUnitLandedCostKgs: row.unit,
        batchUnitCostKgs: row.drift,
        movementUnitCostKgs: row.drift,
      });
      assert.equal(unit, row.unit);
      assert.equal(roundDisplayMoney(unit - row.unit), 0);
    });
  }
});

describe('resolveCurrentProductCatalogUnitCost', () => {
  it('exports authoritative resolver', () => {
    assert.equal(typeof resolveCurrentProductCatalogUnitCost, 'function');
  });
});

describe('fractional allocation — exact stored unit (Test 2 extended)', () => {
  it('preserves purchase-costing unit when line total has remainder', () => {
    const qty = 11;
    const unit = 1662.97;
    const lineTotal = roundDisplayMoney(new Prisma.Decimal(unit).mul(qty));
    const wrongDerived = deriveDisplayUnitCost(lineTotal, qty);
    const stored = resolveStoredFifoCatalogUnitCostFromSources({
      orderLineFinalUnitCostKgs: unit,
      batchUnitCostKgs: wrongDerived,
    });
    assert.equal(stored, unit);
    assert.equal(roundDisplayMoney(stored - unit), 0);
  });
});
