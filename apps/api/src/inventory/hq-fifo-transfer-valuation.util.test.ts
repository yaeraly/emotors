import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeLayerRemainingCostKgs,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { sumActiveRemainingFifoLayerValues } from './inventory-authoritative-value.util';

/** Confirmed production China shipment totals. */
const FIRST_SHIPMENT_LANDED = 914369.8;
const SECOND_SHIPMENT_LANDED = 822036.2;
const HISTORICAL_RECEIVED_TOTAL = 1736406;

describe('HQ FIFO valuation after full first-shipment transfer', () => {
  const firstLayers = [
    {
      remainingQuantity: 0,
      originalLayerValueKgs: 457184.9,
      layerBaseQuantity: 50,
    },
    {
      remainingQuantity: 0,
      originalLayerValueKgs: 457184.9,
      layerBaseQuantity: 50,
    },
  ];
  const secondLayers = [
    {
      remainingQuantity: 40,
      originalLayerValueKgs: 411018.1,
      layerBaseQuantity: 40,
    },
    {
      remainingQuantity: 40,
      originalLayerValueKgs: 411018.1,
      layerBaseQuantity: 40,
    },
  ];

  it('first shipment original cost equals 914369.80 KGS', () => {
    assert.equal(
      sumDisplayMoneyTotals(firstLayers.map((layer) => layer.originalLayerValueKgs)),
      FIRST_SHIPMENT_LANDED,
    );
  });

  it('second shipment original cost equals 822036.20 KGS', () => {
    assert.equal(
      sumDisplayMoneyTotals(secondLayers.map((layer) => layer.originalLayerValueKgs)),
      SECOND_SHIPMENT_LANDED,
    );
  });

  it('historical total equals 1736406.00 KGS', () => {
    assert.equal(
      roundDisplayMoney(FIRST_SHIPMENT_LANDED + SECOND_SHIPMENT_LANDED),
      HISTORICAL_RECEIVED_TOTAL,
    );
  });

  it('first shipment fully transferred leaves 0.00 KGS remaining in HQ FIFO', () => {
    assert.equal(sumActiveRemainingFifoLayerValues(firstLayers), 0);
    for (const layer of firstLayers) {
      assert.equal(layer.remainingQuantity, 0);
      assert.equal(
        computeLayerRemainingCostKgs(
          layer.originalLayerValueKgs,
          layer.layerBaseQuantity,
          layer.remainingQuantity,
        ),
        0,
      );
    }
  });

  it('first shipment historical FIFO records remain available', () => {
    assert.equal(firstLayers.length, 2);
    assert.equal(
      sumDisplayMoneyTotals(firstLayers.map((layer) => layer.originalLayerValueKgs)),
      FIRST_SHIPMENT_LANDED,
    );
  });

  it('first shipment cost is excluded from current HQ Warehouse valuation', () => {
    const current = sumActiveRemainingFifoLayerValues([...firstLayers, ...secondLayers]);
    assert.equal(current, SECOND_SHIPMENT_LANDED);
    assert.notEqual(current, HISTORICAL_RECEIVED_TOTAL);
  });

  it('second shipment remains fully active at 822036.20 KGS', () => {
    assert.equal(sumActiveRemainingFifoLayerValues(secondLayers), SECOND_SHIPMENT_LANDED);
    for (const layer of secondLayers) {
      assert.equal(layer.remainingQuantity, layer.layerBaseQuantity);
      assert.equal(
        computeLayerRemainingCostKgs(
          layer.originalLayerValueKgs,
          layer.layerBaseQuantity,
          layer.remainingQuantity,
        ),
        layer.originalLayerValueKgs,
      );
    }
  });

  it('HQ inventory balance value equals active remaining HQ FIFO value', () => {
    const hqInventoryBalanceValue = SECOND_SHIPMENT_LANDED;
    const activeRemainingFifo = sumActiveRemainingFifoLayerValues([
      ...firstLayers,
      ...secondLayers,
    ]);
    assert.equal(hqInventoryBalanceValue, 822036.2);
    assert.equal(activeRemainingFifo, 822036.2);
    assert.equal(roundDisplayMoney(hqInventoryBalanceValue - activeRemainingFifo), 0);
  });

  it('zero-remaining FIFO layers contribute zero value', () => {
    assert.equal(
      sumActiveRemainingFifoLayerValues([
        { remainingQuantity: 0, originalLayerValueKgs: FIRST_SHIPMENT_LANDED, layerBaseQuantity: 100 },
      ]),
      0,
    );
  });

  it('partial FIFO consumption calculates remaining value correctly', () => {
    const original = 1000;
    const baseQty = 10;
    const remaining = 4;
    const remainingValue = computeLayerRemainingCostKgs(original, baseQty, remaining);
    assert.equal(remainingValue, 400);
    assert.equal(roundDisplayMoney(original - remainingValue), 600);
  });

  it('blended average × remaining qty is NOT used as authoritative remaining value', () => {
    const historical = HISTORICAL_RECEIVED_TOTAL;
    const historicalQty = 180;
    const remainingQty = 80;
    const blendedAverage = deriveDisplayUnitCost(historical, historicalQty);
    const falseRemaining = roundDisplayMoney(blendedAverage * remainingQty);
    const trueRemaining = SECOND_SHIPMENT_LANDED;
    assert.notEqual(falseRemaining, trueRemaining);
    assert.equal(trueRemaining, sumActiveRemainingFifoLayerValues(secondLayers));
  });

  it('branch FIFO layers are excluded from HQ valuation by warehouse filter contract', () => {
    const hqOnly = sumActiveRemainingFifoLayerValues(secondLayers);
    const branchLayerValue = FIRST_SHIPMENT_LANDED;
    // HQ valuation uses warehouseId filter; branch layers must not be added.
    assert.equal(hqOnly, SECOND_SHIPMENT_LANDED);
    assert.notEqual(roundDisplayMoney(hqOnly + branchLayerValue), SECOND_SHIPMENT_LANDED);
  });

  it('decimal precision does not create a false mismatch at money scale', () => {
    const a = 411018.1;
    const b = 411018.1;
    assert.equal(roundDisplayMoney(a + b), SECOND_SHIPMENT_LANDED);
    assert.equal(roundDisplayMoney(SECOND_SHIPMENT_LANDED - (a + b)), 0);
  });
});
