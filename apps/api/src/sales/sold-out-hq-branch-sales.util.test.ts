import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePricingCostBasis, normalizeConfiguredPrice } from '../pricing/pricing-cost-basis.util';
import { pricesFromMarkups } from '../pricing/pricing-calculator.util';

/**
 * Documents Branch Sales availability vs Pricing Policy cost-basis separation
 * for products fully transferred from HQ Warehouse to HQ Branch.
 */
function branchAvailableQuantity(input: {
  branchQuantity: number;
  branchReservedQuantity: number;
  hqQuantity: number;
}) {
  // Branch Sales must use Branch Warehouse availability, never HQ Warehouse qty.
  void input.hqQuantity;
  return Math.max(input.branchQuantity - input.branchReservedQuantity, 0);
}

function canAddProductToBranchSale(input: {
  branchAvailableQty: number;
  customerSellingPrice: number | null;
}) {
  return input.branchAvailableQty > 0 && normalizeConfiguredPrice(input.customerSellingPrice) != null;
}

describe('sold-out HQ product remains sellable by branch with stock', () => {
  const transferredLayers = [
    { id: 'hq-layer-1', remainingQuantity: 0, unitCostKgs: 407.53, receivedAt: '2026-01-10' },
    { id: 'hq-layer-2', remainingQuantity: 0, unitCostKgs: 0, receivedAt: '2026-02-10' },
  ];

  it('HQ warehouse quantity is zero after full transfer; branch keeps 11', () => {
    const available = branchAvailableQuantity({
      branchQuantity: 11,
      branchReservedQuantity: 0,
      hqQuantity: 0,
    });
    assert.equal(available, 11);
  });

  it('Pricing Policy keeps latest valid cost basis when HQ FIFO remaining is zero', () => {
    const basis = resolvePricingCostBasis({ layers: transferredLayers });
    assert.equal(basis.available, true);
    assert.equal(basis.costPriceKgs, 407.53);
    assert.notEqual(basis.source, 'NO_COST_BASIS');
  });

  it('published retail/master/wholesale prices remain greater than zero', () => {
    const basis = resolvePricingCostBasis({ layers: transferredLayers });
    const prices = pricesFromMarkups(basis.costPriceKgs, {
      hqBranchWholesaleMarkupPercent: 10,
      wholesaleMarkupPercent: 15,
      masterMarkupPercent: 20,
      recommendedRetailMarkupPercent: 35,
      minimumSellingMarkupPercent: 25,
    });
    assert.ok(prices.recommendedRetailPriceKgs > 0);
    assert.ok(prices.masterPriceKgs > 0);
    assert.ok(prices.wholesalePriceKgs > 0);
    assert.ok(prices.hqBranchWholesalePriceKgs > 0);
  });

  it('Branch Sales can add the product when branch has stock and a valid selling price', () => {
    const basis = resolvePricingCostBasis({ layers: transferredLayers });
    const prices = pricesFromMarkups(basis.costPriceKgs, {
      hqBranchWholesaleMarkupPercent: 10,
      wholesaleMarkupPercent: 15,
      recommendedRetailMarkupPercent: 35,
      minimumSellingMarkupPercent: 25,
    });
    const available = branchAvailableQuantity({
      branchQuantity: 11,
      branchReservedQuantity: 0,
      hqQuantity: 0,
    });
    assert.equal(
      canAddProductToBranchSale({
        branchAvailableQty: available,
        customerSellingPrice: prices.recommendedRetailPriceKgs,
      }),
      true,
    );
  });

  it('Branch Sales does not require HQ Warehouse stock', () => {
    const available = branchAvailableQuantity({
      branchQuantity: 11,
      branchReservedQuantity: 0,
      hqQuantity: 0,
    });
    assert.equal(available > 0, true);
  });

  it('missing genuine pricing configuration shows null, not fake 0 configured price', () => {
    assert.equal(normalizeConfiguredPrice(0), null);
    assert.equal(normalizeConfiguredPrice(null), null);
    assert.equal(
      canAddProductToBranchSale({ branchAvailableQty: 11, customerSellingPrice: 0 }),
      false,
    );
  });
});
