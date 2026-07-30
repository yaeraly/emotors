/**
 * Retail catalog list must keep recommended and maximum prices in separate fields.
 */
import assert from 'node:assert/strict';
import { MaximumMarkupSource, MaximumPricePolicySource } from '@prisma/client';
import { describe, it } from 'node:test';
import { buildRetailMarkupRow } from './product-markup-resolution.util';
import { applyMarkupRoundUp } from './pricing-calculator.util';

function applyRetailPrice(basePrice: number, markupPercent: number) {
  return applyMarkupRoundUp(basePrice, markupPercent);
}

const category = {
  defaultRetailMaximumPolicy: 'HARD_LIMIT' as const,
  defaultWholesaleMaximumPolicy: 'HARD_LIMIT' as const,
  defaultRetailMaximumMarkupPercent: 30,
  defaultWholesaleMaximumMarkupPercent: 20,
};

const baseRetailProduct = {
  id: 'p1',
  retailMaximumPolicySource: MaximumPricePolicySource.CATEGORY,
  wholesaleMaximumPolicySource: MaximumPricePolicySource.CATEGORY,
  retailMaximumPolicy: 'DISABLED' as const,
  wholesaleMaximumPolicy: 'DISABLED' as const,
  maximumRetailMarkupPercent: 0,
  maximumWholesaleMarkupPercent: 0,
  minimumSellingMarkupPercent: 10,
  recommendedRetailMarkupPercent: 20,
  minimumWholesaleMarkupPercent: 5,
  wholesaleMarkupPercent: 15,
  maximumRetailMarkupOverridePercent: null,
  maximumWholesaleMarkupOverridePercent: null,
};

describe('retail catalog display prices', () => {
  it('save only recommended markup — recommended price displays correctly', () => {
    const row = buildRetailMarkupRow(
      { ...baseRetailProduct, recommendedRetailMarkupPercent: 25 },
      category,
      1000,
    );
    assert.equal(row.recommendedRetailMarkupPercent, 25);
    assert.equal(row.recommendedRetailPriceKgs, 1250);
    assert.equal(row.maximumRetailPriceKgs, 1300);
    assert.notEqual(row.recommendedRetailPriceKgs, row.maximumRetailPriceKgs);
  });

  it('save only maximal markup — maximal price displays correctly', () => {
    const row = buildRetailMarkupRow(
      {
        ...baseRetailProduct,
        recommendedRetailMarkupPercent: 20,
        maximumRetailMarkupOverridePercent: 45,
      },
      category,
      1000,
    );
    assert.equal(row.effectiveMaximumRetailMarkupPercent, 45);
    assert.equal(row.maximumRetailPriceKgs, 1450);
    assert.equal(row.recommendedRetailPriceKgs, 1200);
    assert.equal(row.maximumRetailMarkupSource, MaximumMarkupSource.CEO_PRODUCT_OVERRIDE);
  });

  it('save both markups — each price appears in its own column', () => {
    const row = buildRetailMarkupRow(
      {
        ...baseRetailProduct,
        recommendedRetailMarkupPercent: 22,
        maximumRetailMarkupOverridePercent: 38,
      },
      category,
      800,
    );
    assert.equal(row.recommendedRetailPriceKgs, applyRetailPrice(800, 22));
    assert.equal(row.maximumRetailPriceKgs, applyRetailPrice(800, 38));
    assert.equal(row.recommendedRetailMarkupPercent, 22);
    assert.equal(row.effectiveMaximumRetailMarkupPercent, 38);
    assert.notEqual(row.recommendedRetailPriceKgs, row.maximumRetailPriceKgs);
  });

  it('maximal markup does not overwrite recommended markup', () => {
    const before = buildRetailMarkupRow(
      { ...baseRetailProduct, recommendedRetailMarkupPercent: 18 },
      category,
      500,
    );
    const after = buildRetailMarkupRow(
      {
        ...baseRetailProduct,
        recommendedRetailMarkupPercent: 18,
        maximumRetailMarkupOverridePercent: 40,
      },
      category,
      500,
    );
    assert.equal(after.recommendedRetailMarkupPercent, before.recommendedRetailMarkupPercent);
    assert.equal(after.recommendedRetailPriceKgs, before.recommendedRetailPriceKgs);
    assert.notEqual(after.maximumRetailPriceKgs, after.recommendedRetailPriceKgs);
  });
});
