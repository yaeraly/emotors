import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasFranchiseSalesActiveMarkup,
  isFranchiseSalesCostAvailable,
  normalizeFranchiseSalesCatalogResponse,
  resolveFranchiseSalesDisplayedBranchPriceKgs,
  type FranchiseSalesCatalogRow,
} from './franchise-sales-catalog';

function sampleRow(overrides: Partial<FranchiseSalesCatalogRow> = {}): FranchiseSalesCatalogRow {
  return {
    id: 'p1',
    name: 'Товар',
    sku: 'SKU-1',
    categoryName: 'Категория',
    costPriceKgs: 100,
    costAvailable: true,
    markupConfigured: false,
    configurationStatus: 'NOT_CONFIGURED',
    hqMarkupPercent: 0,
    baseFranchiseMarkupPercent: 0,
    branchPriceKgs: null,
    finalBranchPriceKgs: null,
    masterBranchPriceKgs: null,
    priceConfigured: false,
    lastUpdated: '2026-08-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('franchise-sales catalog frontend helpers', () => {
  it('normalizes structured list response with warning', () => {
    const normalized = normalizeFranchiseSalesCatalogResponse({
      items: [sampleRow()],
      total: 1,
      activePricingPolicyVersionId: null,
      activePricingPolicyVersionNumber: null,
      warning: 'Активная версия ценовой политики не настроена.',
    });
    assert.equal(normalized.items.length, 1);
    assert.equal(normalized.total, 1);
    assert.match(String(normalized.warning), /не настроена/i);
  });

  it('normalizes legacy array responses without dropping products', () => {
    const normalized = normalizeFranchiseSalesCatalogResponse([
      sampleRow({ id: 'a' }),
      sampleRow({ id: 'b', markupConfigured: true, hqMarkupPercent: 10 }),
    ]);
    assert.equal(normalized.items.length, 2);
    assert.equal(normalized.total, 2);
  });

  it('renders null markup / branch price safely for unconfigured products', () => {
    const row = sampleRow({
      branchPriceKgs: 1670,
      finalBranchPriceKgs: 1670,
      masterBranchPriceKgs: 1670,
      markupConfigured: false,
      configurationStatus: 'NOT_CONFIGURED',
      hqMarkupPercent: 0,
    });
    assert.equal(hasFranchiseSalesActiveMarkup(row.hqMarkupPercent), false);
    assert.equal(resolveFranchiseSalesDisplayedBranchPriceKgs(row), null);
    assert.equal(isFranchiseSalesCostAvailable(row), true);
  });

  it('keeps configured branch price when markup exists', () => {
    const row = sampleRow({
      markupConfigured: true,
      configurationStatus: 'CONFIGURED',
      hqMarkupPercent: 15,
      baseFranchiseMarkupPercent: 15,
      branchPriceKgs: 1150,
      finalBranchPriceKgs: 1150,
      priceConfigured: true,
    });
    assert.equal(resolveFranchiseSalesDisplayedBranchPriceKgs(row), 1150);
  });

  it('treats empty payload as empty catalog, not an error shape', () => {
    const normalized = normalizeFranchiseSalesCatalogResponse(undefined);
    assert.deepEqual(normalized.items, []);
    assert.equal(normalized.total, 0);
  });
});
