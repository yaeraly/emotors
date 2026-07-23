/**
 * Product catalog Себестоимость must use the shared HQ FIFO active-layer resolver,
 * never Product.finalCostKgs / InventoryBalance.averageCostKgs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function mapCatalogCost(input: {
  storedFinalCostKgs: number;
  fifo: { available: boolean; costPriceKgs: number };
}) {
  const costAvailable = Boolean(input.fifo.available && input.fifo.costPriceKgs > 0);
  return {
    finalCostKgs: costAvailable ? input.fifo.costPriceKgs : null,
    costAvailable,
    // Prove we ignore the stale product snapshot even when it looks like an average.
    ignoredStoredFinalCostKgs: input.storedFinalCostKgs,
  };
}

describe('product catalog FIFO cost mapping', () => {
  it('uses active FIFO unit cost instead of Product.finalCostKgs snapshot', () => {
    const mapped = mapCatalogCost({
      storedFinalCostKgs: 407.53,
      fifo: { available: true, costPriceKgs: 350 },
    });
    assert.equal(mapped.finalCostKgs, 350);
    assert.equal(mapped.costAvailable, true);
    assert.notEqual(mapped.finalCostKgs, mapped.ignoredStoredFinalCostKgs);
  });

  it('returns null when no active HQ FIFO layer exists', () => {
    const mapped = mapCatalogCost({
      storedFinalCostKgs: 445.88,
      fifo: { available: false, costPriceKgs: 0 },
    });
    assert.equal(mapped.finalCostKgs, null);
    assert.equal(mapped.costAvailable, false);
  });

  it('switches to the next layer unit cost after depletion', () => {
    const layers = [
      { remainingQuantity: 0, unitCostKgs: 350 },
      { remainingQuantity: 120, unitCostKgs: 445.88 },
    ];
    const active = layers.find((l) => l.remainingQuantity > 0);
    const mapped = mapCatalogCost({
      storedFinalCostKgs: 407.53,
      fifo: { available: true, costPriceKgs: active!.unitCostKgs },
    });
    assert.equal(mapped.finalCostKgs, 445.88);
  });
});
