/**
 * Franchise-sales catalog must start from active HQ products and never drop
 * rows that lack FIFO layers, stock, or markup rules.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFranchiseSalesCatalogRow,
  filterActiveCatalogProducts,
  filterFranchiseSalesCatalogRows,
  paginateFranchiseSalesCatalogRows,
} from './pricing-franchise-sales-catalog.util';

const baseProduct = {
  id: 'p1',
  name: 'Test Product',
  sku: 'SKU001',
  categoryId: 'cat1',
  category: 'Legacy',
  isActive: true,
  updatedAt: new Date('2026-01-01'),
  hqBranchWholesaleMarkupPercent: 0,
  hqBranchWholesalePriceKgs: 0,
  productCategory: { nameRu: 'Категория', nameEn: 'Category' },
};

describe('franchise-sales catalog inclusion', () => {
  it('includes active product with pricing', () => {
    const row = buildFranchiseSalesCatalogRow(
      { ...baseProduct, hqBranchWholesaleMarkupPercent: 15, hqBranchWholesalePriceKgs: 0 },
      { available: true, costPriceKgs: 100, source: 'FIFO', batchId: 'b1' },
      {
        baseFranchiseMarkupPercent: 15,
        baseBranchPriceKgs: 115,
        resolvedPriceKgs: 115,
        pricingPolicyVersionId: 'ver-1',
        pricingPolicyVersionNumber: 1,
        pricingProfileId: 'profile-1',
        appliedRuleType: 'BASE_FRANCHISE',
        costSource: 'FIFO',
      },
      { id: 'branch-1', name: 'Branch 1' },
    );
    assert.equal(row.sku, 'SKU001');
    assert.equal(row.costPriceKgs, 100);
    assert.equal(row.costAvailable, true);
    assert.equal(row.markupConfigured, true);
    assert.equal(row.baseFranchiseMarkupPercent, 15);
    assert.equal(row.branchPriceKgs, 115);
    assert.equal(row.pricingPolicyVersionId, 'ver-1');
  });

  it('includes active product without pricing', () => {
    const row = buildFranchiseSalesCatalogRow(
      baseProduct,
      { available: false, costPriceKgs: 0 },
      null,
      { id: 'branch-1', name: 'Branch 1' },
    );
    assert.equal(row.sku, 'SKU001');
    assert.equal(row.costPriceKgs, null);
    assert.equal(row.costAvailable, false);
    assert.equal(row.markupConfigured, false);
    assert.equal(row.baseFranchiseMarkupPercent, 0);
    assert.equal(row.branchPriceKgs, null);
    assert.equal(row.priceConfigured, false);
  });

  it('includes multiple active products from catalog filter', () => {
    const catalog = [
      { id: '1', isActive: true, sku: 'A' },
      { id: '2', isActive: true, sku: 'B' },
      { id: '3', isActive: false, sku: 'C' },
    ];
    const active = filterActiveCatalogProducts(catalog);
    assert.equal(active.length, 2);
    assert.deepEqual(active.map((p) => p.sku), ['A', 'B']);
  });

  it('excludes inactive products from active catalog filter', () => {
    const active = filterActiveCatalogProducts([
      { id: '1', isActive: false, sku: 'X' },
    ]);
    assert.equal(active.length, 0);
  });

  it('empty search returns all active rows', () => {
    const rows = [
      { name: 'Alpha', sku: 'A', categoryName: 'Cat' },
      { name: 'Beta', sku: 'B', categoryName: 'Cat' },
    ];
    const filtered = filterFranchiseSalesCatalogRows(rows, '', '');
    assert.equal(filtered.length, 2);
  });

  it('category filter works', () => {
    const rows = [
      { name: 'Alpha', sku: 'A', categoryName: 'Motors' },
      { name: 'Beta', sku: 'B', categoryName: 'Parts' },
    ];
    const filtered = filterFranchiseSalesCatalogRows(rows, '', 'Parts');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.sku, 'B');
  });

  it('clearing filters restores all rows', () => {
    const rows = [
      { name: 'Alpha', sku: 'A', categoryName: 'Motors' },
      { name: 'Beta', sku: 'B', categoryName: 'Parts' },
    ];
    const narrowed = filterFranchiseSalesCatalogRows(rows, 'beta', 'Parts');
    assert.equal(narrowed.length, 1);
    const restored = filterFranchiseSalesCatalogRows(rows, '', '');
    assert.equal(restored.length, 2);
  });

  it('pagination works', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      name: `Item ${index}`,
      sku: `S${index}`,
      categoryName: 'Cat',
    }));
    const page1 = paginateFranchiseSalesCatalogRows(rows, 1, 2);
    const page2 = paginateFranchiseSalesCatalogRows(rows, 2, 2);
    assert.equal(page1.length, 2);
    assert.equal(page2.length, 2);
    assert.equal(page1[0]?.sku, 'S0');
    assert.equal(page2[0]?.sku, 'S2');
  });

  it('loads existing pricing values correctly', () => {
    const row = buildFranchiseSalesCatalogRow(
      {
        ...baseProduct,
        hqBranchWholesaleMarkupPercent: 20,
        hqBranchWholesalePriceKgs: 480,
      },
      { available: true, costPriceKgs: 400 },
      null,
      null,
    );
    assert.equal(row.baseFranchiseMarkupPercent, 20);
    assert.equal(row.branchPriceKgs, 480);
    assert.equal(row.priceConfigured, true);
  });

  it('product without pricing shows unconfigured markup', () => {
    const row = buildFranchiseSalesCatalogRow(
      baseProduct,
      { available: true, costPriceKgs: 200 },
      null,
      null,
    );
    assert.equal(row.markupConfigured, false);
    assert.equal(row.baseFranchiseMarkupPercent, 0);
    assert.equal(row.recommendedMarkupPercent, null);
    assert.equal(row.branchPriceKgs, null);
  });

  it('prefers stored product markup over engine when both exist', () => {
    const row = buildFranchiseSalesCatalogRow(
      { ...baseProduct, hqBranchWholesaleMarkupPercent: 25 },
      { available: true, costPriceKgs: 100 },
      {
        baseFranchiseMarkupPercent: 10,
        baseBranchPriceKgs: 110,
        resolvedPriceKgs: 110,
        pricingPolicyVersionId: 'ver-1',
        pricingProfileId: null,
        appliedRuleType: 'BASE_FRANCHISE',
      },
      { id: 'b1', name: 'B1' },
    );
    assert.equal(row.baseFranchiseMarkupPercent, 25);
  });

  it('calculates branch price from cost and markup when no stored price', () => {
    const row = buildFranchiseSalesCatalogRow(
      { ...baseProduct, hqBranchWholesaleMarkupPercent: 10 },
      { available: true, costPriceKgs: 100 },
      null,
      null,
    );
    assert.equal(row.branchPriceKgs, 110);
    assert.equal(row.priceConfigured, true);
  });

  it('never presents 0 as a valid missing FIFO cost', () => {
    const row = buildFranchiseSalesCatalogRow(
      baseProduct,
      { available: false, costPriceKgs: 0 },
      null,
      null,
    );
    assert.equal(row.costPriceKgs, null);
    assert.notEqual(row.costPriceKgs, 0);
  });

  it('returns expected API response shape', () => {
    const row = buildFranchiseSalesCatalogRow(
      baseProduct,
      { available: true, costPriceKgs: 50, batchId: 'batch-1' },
      null,
      { id: 'branch-1', name: 'Branch 1' },
    );
    assert.equal(typeof row.id, 'string');
    assert.equal(typeof row.name, 'string');
    assert.equal(typeof row.sku, 'string');
    assert.equal(typeof row.categoryName, 'string');
    assert.equal(row.displayBranchId, 'branch-1');
    assert.equal(row.displayBranchName, 'Branch 1');
    assert.ok('costAvailable' in row);
    assert.ok('markupConfigured' in row);
    assert.ok('priceConfigured' in row);
    assert.ok('lastUpdated' in row);
  });
});

describe('franchise-sales catalog save semantics', () => {
  it('allows configuring pricing for product without previous pricing', () => {
    const before = buildFranchiseSalesCatalogRow(
      baseProduct,
      { available: true, costPriceKgs: 300 },
      null,
      null,
    );
    assert.equal(before.markupConfigured, false);

    const after = buildFranchiseSalesCatalogRow(
      { ...baseProduct, hqBranchWholesaleMarkupPercent: 12, hqBranchWholesalePriceKgs: 336 },
      { available: true, costPriceKgs: 300 },
      null,
      null,
    );
    assert.equal(after.markupConfigured, true);
    assert.equal(after.baseFranchiseMarkupPercent, 12);
    assert.equal(after.branchPriceKgs, 336);
  });

  it('does not imply duplicate pricing records from catalog row builder', () => {
    const row = buildFranchiseSalesCatalogRow(
      { ...baseProduct, hqBranchWholesaleMarkupPercent: 8 },
      { available: true, costPriceKgs: 100 },
      null,
      null,
    );
    assert.ok(!('pricingPolicyRecordId' in row));
    assert.equal(row.pricingPolicyVersionId, null);
  });
});
