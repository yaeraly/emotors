import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeBranchCeoProductRow } from './branch-ceo-product.presenter';

describe('sanitizeBranchCeoProductRow', () => {
  const baseProduct = {
    id: 'prod-1',
    sku: 'SKU-001',
    name: 'Battery',
    barcode: '1234567890',
    unit: 'PCS',
    weightKg: 1.2,
    photoUrl: null,
    description: null,
    brand: 'Brand',
    isActive: true,
    category: 'Parts',
    productCategory: { id: 'cat-1', nameRu: 'Parts' },
    quantity: 5,
    lowStock: false,
    purchasePriceYuan: 100,
    supplier: 'China Supplier',
    factory: 'Factory A',
    finalCostKgs: 900,
    currentFifoUnitCost: 850,
    marginPercent: 20,
    profit: 100,
    currentBranchInventoryCost: 5085.33,
    branchInventoryCostAvailable: true,
  };

  it('exposes currentBranchInventoryCost for Branch CEO catalog', () => {
    const row = sanitizeBranchCeoProductRow(baseProduct);
    assert.equal(row.currentBranchInventoryCost, 5085.33);
    assert.equal(row.branchInventoryCostAvailable, true);
  });

  it('does not expose procurement or HQ confidential fields', () => {
    const row = sanitizeBranchCeoProductRow(baseProduct) as Record<string, unknown>;
    assert.equal(row.purchasePriceYuan, undefined);
    assert.equal(row.supplier, undefined);
    assert.equal(row.factory, undefined);
    assert.equal(row.finalCostKgs, undefined);
    assert.equal(row.currentFifoUnitCost, undefined);
    assert.equal(row.marginPercent, undefined);
    assert.equal(row.profit, undefined);
  });

  it('keeps barcode in API payload for other workflows', () => {
    const row = sanitizeBranchCeoProductRow(baseProduct);
    assert.equal(row.barcode, '1234567890');
  });

  it('returns null cost when branch stock is unavailable', () => {
    const row = sanitizeBranchCeoProductRow({
      ...baseProduct,
      currentBranchInventoryCost: null,
      branchInventoryCostAvailable: false,
    });
    assert.equal(row.currentBranchInventoryCost, null);
    assert.equal(row.branchInventoryCostAvailable, false);
  });
});
