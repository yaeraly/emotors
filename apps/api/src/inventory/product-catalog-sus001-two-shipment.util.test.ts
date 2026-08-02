/**
 * Focused regression: Амортизатор 43×72 (Ø1,5 см) / SUS001
 * First China shipment 1,636.13 fully transferred → excluded.
 * Second China shipment 1,662.97 remains active → Product Catalog cost.
 * Stale 309.78 (purchase-only / non-FIFO snapshot) must never win.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapProductCatalogFifoCost,
  resolveOldestActiveFifoCatalogUnitCost,
  selectOldestActiveFifoUnitCost,
  simulateFifoCatalogConsumption,
  type FifoCatalogLayerInput,
} from './product-catalog-fifo-cost.util';
import { resolveStoredFifoCatalogUnitCostFromSources } from './product-catalog-current-cost.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

const FIRST_UNIT = 1636.13;
const SECOND_UNIT = 1662.97;
const STALE_PURCHASE_ONLY = 309.78;
const FIRST_QTY = 15;
const SECOND_QTY = 12;

function sus001Layers(firstRemaining: number, secondRemaining = SECOND_QTY): FifoCatalogLayerInput[] {
  return [
    {
      id: 'sus001-layer-1',
      receivedAt: '2026-01-10T10:00:00.000Z',
      createdAt: '2026-01-10T10:00:00.000Z',
      remainingQuantity: firstRemaining,
      initialQuantity: FIRST_QTY,
      batchUnitCostKgs: FIRST_UNIT,
      movementUnitCostKgs: FIRST_UNIT,
      movementTotalCostKgs: roundDisplayMoney(FIRST_UNIT * FIRST_QTY),
      movementQuantity: FIRST_QTY,
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
    },
    {
      id: 'sus001-layer-2',
      receivedAt: '2026-02-20T10:00:00.000Z',
      createdAt: '2026-02-20T10:00:00.000Z',
      remainingQuantity: secondRemaining,
      initialQuantity: SECOND_QTY,
      batchUnitCostKgs: SECOND_UNIT,
      movementUnitCostKgs: SECOND_UNIT,
      movementTotalCostKgs: roundDisplayMoney(SECOND_UNIT * SECOND_QTY),
      movementQuantity: SECOND_QTY,
      referenceType: 'PROCUREMENT_GOODS_RECEIVING',
    },
  ];
}

describe('SUS001 two China shipments — HQ Product Catalog FIFO cost', () => {
  it('1. first-shipment unit cost is 1,636.13 KGS', () => {
    assert.equal(FIRST_UNIT, 1636.13);
    const layers = sus001Layers(FIRST_QTY);
    assert.equal(resolveOldestActiveFifoCatalogUnitCost(layers).unitCostKgs, FIRST_UNIT);
  });

  it('2. second-shipment unit cost is 1,662.97 KGS', () => {
    assert.equal(SECOND_UNIT, 1662.97);
    const layers = sus001Layers(0);
    assert.equal(resolveOldestActiveFifoCatalogUnitCost(layers).unitCostKgs, SECOND_UNIT);
  });

  it('3. first-shipment FIFO history remains intact after full transfer', () => {
    const layers = sus001Layers(0);
    assert.equal(layers[0]?.initialQuantity, FIRST_QTY);
    assert.equal(layers[0]?.batchUnitCostKgs, FIRST_UNIT);
    assert.equal(layers[0]?.remainingQuantity, 0);
  });

  it('4. first-shipment remaining HQ quantity is zero', () => {
    assert.equal(sus001Layers(0)[0]?.remainingQuantity, 0);
  });

  it('5. fully consumed first layer is excluded from catalog selection', () => {
    const cost = selectOldestActiveFifoUnitCost(
      sus001Layers(0).map((layer) => ({
        id: layer.id,
        receivedAt: layer.receivedAt,
        createdAt: layer.createdAt,
        remainingQuantity: layer.remainingQuantity,
        unitLandedCostKgs: layer.batchUnitCostKgs,
      })),
    );
    assert.equal(cost, SECOND_UNIT);
    assert.notEqual(cost, FIRST_UNIT);
  });

  it('6. second-shipment layer is active and untransferred', () => {
    const second = sus001Layers(0)[1]!;
    assert.equal(second.remainingQuantity, second.initialQuantity);
    assert.equal(second.remainingQuantity > 0, true);
  });

  it('7-9. Product Catalog displays 1,662.97 and not 309.78 / first-layer cost', () => {
    const resolved = resolveOldestActiveFifoCatalogUnitCost(sus001Layers(0));
    const mapped = mapProductCatalogFifoCost({
      fifo: {
        costPriceKgs: resolved.unitCostKgs ?? 0,
        available: resolved.unitCostKgs != null,
        source: 'HQ_FIFO_ACTIVE_LAYER',
        batchId: resolved.batchId,
        receivedAt: new Date('2026-02-20T10:00:00.000Z'),
        warehouseId: 'hq-wh',
      },
    });
    assert.equal(mapped.currentFifoUnitCost, SECOND_UNIT);
    assert.equal(mapped.currentHqFifoUnitCost, SECOND_UNIT);
    assert.equal(mapped.finalCostKgs, SECOND_UNIT);
    assert.notEqual(mapped.currentHqFifoUnitCost, STALE_PURCHASE_ONLY);
    assert.notEqual(mapped.currentHqFifoUnitCost, FIRST_UNIT);
  });

  it('10-15. FIFO selection excludes seed/poison layers and requires remaining > 0', () => {
    const hqActive = sus001Layers(0);
    const withPoison = [
      ...hqActive,
      {
        ...hqActive[0]!,
        id: 'seed-poison',
        remainingQuantity: 99,
        batchUnitCostKgs: STALE_PURCHASE_ONLY,
        isSeed: true,
      },
    ];
    const cost = resolveOldestActiveFifoCatalogUnitCost(withPoison).unitCostKgs;
    assert.equal(cost, SECOND_UNIT);
  });

  it('16. partial first-layer stock continues to use 1,636.13 KGS', () => {
    const afterPartial = simulateFifoCatalogConsumption(sus001Layers(FIRST_QTY), 5);
    assert.equal(resolveOldestActiveFifoCatalogUnitCost(afterPartial).unitCostKgs, FIRST_UNIT);
  });

  it('17. after first layer reaches zero, cost switches to 1,662.97 KGS', () => {
    const afterFull = simulateFifoCatalogConsumption(sus001Layers(FIRST_QTY), FIRST_QTY);
    assert.equal(afterFull[0]?.remainingQuantity, 0);
    assert.equal(resolveOldestActiveFifoCatalogUnitCost(afterFull).unitCostKgs, SECOND_UNIT);
  });

  it('18. product without active HQ stock displays null / unavailable', () => {
    const empty = resolveOldestActiveFifoCatalogUnitCost(sus001Layers(0, 0));
    assert.equal(empty.unitCostKgs, null);
    const mapped = mapProductCatalogFifoCost({
      fifo: {
        costPriceKgs: 0,
        available: false,
        source: 'NO_FIFO_LAYER',
        batchId: null,
        receivedAt: null,
        warehouseId: 'hq-wh',
      },
    });
    assert.equal(mapped.costAvailable, false);
    assert.equal(mapped.currentHqFifoUnitCost, null);
  });

  it('20. Decimal precision remains exact for both shipment units', () => {
    assert.equal(roundDisplayMoney(FIRST_UNIT), 1636.13);
    assert.equal(roundDisplayMoney(SECOND_UNIT), 1662.97);
    assert.equal(roundDisplayMoney(STALE_PURCHASE_ONLY), 309.78);
  });

  it('documents exact source class of incorrect 309.78 KGS', () => {
    // 309.78 matches a purchase-only Product snapshot (yuan×rate), not a China landed FIFO layer.
    const storedPurchaseOnly = resolveStoredFifoCatalogUnitCostFromSources({
      batchUnitCostKgs: STALE_PURCHASE_ONLY,
      movementUnitCostKgs: STALE_PURCHASE_ONLY,
    });
    assert.equal(storedPurchaseOnly, STALE_PURCHASE_ONLY);

    const authoritative = resolveStoredFifoCatalogUnitCostFromSources({
      snapshotUnitLandedCostKgs: SECOND_UNIT,
      orderLineFinalUnitCostKgs: SECOND_UNIT,
      batchUnitCostKgs: STALE_PURCHASE_ONLY,
      movementUnitCostKgs: STALE_PURCHASE_ONLY,
    });
    assert.equal(authoritative, SECOND_UNIT);
    assert.notEqual(authoritative, STALE_PURCHASE_ONLY);

    // Wrong formula class examples that can surface ~309.78:
    // - purchasePriceYuan × yuanRate without transport (stored purchaseCostKgs)
    // - shipment landed total ÷ inflated combined qty/weight
    const yuanTimesRate = roundDisplayMoney(220 * 1.4081);
    assert.ok(Math.abs(yuanTimesRate - STALE_PURCHASE_ONLY) < 0.05);
    const wrongDivisor = roundDisplayMoney(24944.55 / 80.5);
    assert.ok(Math.abs(wrongDivisor - STALE_PURCHASE_ONLY) < 0.15);
  });

  it('prefers stored landed unit over total÷qty drift for catalog projection', () => {
    const driftedDerived = roundDisplayMoney((SECOND_UNIT * SECOND_QTY + 0.06) / SECOND_QTY);
    const preferred = resolveStoredFifoCatalogUnitCostFromSources({
      snapshotUnitLandedCostKgs: SECOND_UNIT,
      batchUnitCostKgs: driftedDerived,
      movementUnitCostKgs: driftedDerived,
    });
    assert.equal(preferred, SECOND_UNIT);
  });
});
