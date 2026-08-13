import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeConfiguredPrice,
  resolvePricingCostBasis,
  selectActiveHqFifoCostBasis,
  selectDepletedHqFifoCostBasis,
} from './pricing-cost-basis.util';

describe('pricing cost basis for sold-out HQ stock', () => {
  const firstShipment = {
    id: 'layer-1',
    remainingQuantity: 11,
    unitCostKgs: 407.53,
    receivedAt: '2026-01-10',
  };
  const secondShipmentEmpty = {
    id: 'layer-2',
    remainingQuantity: 0,
    unitCostKgs: 0,
    receivedAt: '2026-02-10',
  };

  it('uses active HQ FIFO cost while stock remains', () => {
    const selected = selectActiveHqFifoCostBasis([firstShipment, secondShipmentEmpty]);
    assert.equal(selected?.costPriceKgs, 407.53);
    assert.equal(selected?.source, 'HQ_FIFO_ACTIVE_LAYER');
  });

  it('keeps first-shipment cost basis after full HQ→Branch transfer (remaining = 0)', () => {
    const transferred = { ...firstShipment, remainingQuantity: 0 };
    const active = selectActiveHqFifoCostBasis([transferred, secondShipmentEmpty]);
    assert.equal(active, null);

    const depleted = selectDepletedHqFifoCostBasis([transferred, secondShipmentEmpty]);
    assert.equal(depleted?.costPriceKgs, 407.53);
    assert.equal(depleted?.source, 'HQ_FIFO_DEPLETED_LAYER');
    assert.equal(depleted?.sourceRecordId, 'layer-1');
  });

  it('prefers published Pricing Policy snapshot over depleted FIFO when both exist', () => {
    const transferred = { ...firstShipment, remainingQuantity: 0 };
    const result = resolvePricingCostBasis({
      layers: [transferred],
      snapshotCostKgs: 410,
      snapshotId: 'snap-1',
    });
    assert.equal(result.available, true);
    assert.equal(result.costPriceKgs, 410);
    assert.equal(result.source, 'PRICING_POLICY_SNAPSHOT');
    assert.equal(result.sourceRecordId, 'snap-1');
  });

  it('falls back to depleted FIFO receipt cost when snapshot is missing or zero', () => {
    const transferred = { ...firstShipment, remainingQuantity: 0 };
    const result = resolvePricingCostBasis({
      layers: [transferred, secondShipmentEmpty],
      snapshotCostKgs: 0,
      snapshotId: null,
    });
    assert.equal(result.available, true);
    assert.equal(result.costPriceKgs, 407.53);
    assert.equal(result.source, 'HQ_FIFO_DEPLETED_LAYER');
  });

  it('does not convert missing cost basis into a fake zero configured price', () => {
    const result = resolvePricingCostBasis({
      layers: [secondShipmentEmpty],
      snapshotCostKgs: null,
    });
    assert.equal(result.available, false);
    assert.equal(result.source, 'NO_COST_BASIS');
    assert.equal(normalizeConfiguredPrice(0), null);
    assert.equal(normalizeConfiguredPrice(result.costPriceKgs), null);
  });

  it('keeps valid published selling prices greater than zero when cost basis is restored', () => {
    const costBasis = 407.53;
    const retailMarkup = 35;
    const retailPrice = Math.ceil(costBasis * (1 + retailMarkup / 100));
    assert.ok(retailPrice > 0);
    assert.equal(normalizeConfiguredPrice(retailPrice), retailPrice);
  });

  it('second shipment with zero units does not wipe the first-shipment cost basis', () => {
    const result = resolvePricingCostBasis({
      layers: [
        { id: 'layer-1', remainingQuantity: 0, unitCostKgs: 407.53, receivedAt: '2026-01-10' },
        { id: 'layer-2', remainingQuantity: 0, unitCostKgs: 0, receivedAt: '2026-02-10' },
      ],
    });
    assert.equal(result.costPriceKgs, 407.53);
    assert.equal(result.available, true);
  });
});
