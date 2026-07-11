import { MaximumMarkupSource, MaximumPricePolicySource } from '@prisma/client';
import {
  MARKUP_VALIDATION_MESSAGES,
  buildRetailMarkupRow,
  buildWholesaleMarkupRow,
  resolveEffectiveMaximumRetailMarkupPercent,
  resolveEffectiveMaximumWholesaleMarkupPercent,
  validateRetailMarkups,
  validateWholesaleMarkups,
} from './product-markup-resolution.util';

describe('product-markup-resolution.util', () => {
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

  it('inherits maximum retail markup from category policy', () => {
    expect(resolveEffectiveMaximumRetailMarkupPercent(baseRetailProduct, category)).toBe(30);
  });

  it('uses CEO retail override when present', () => {
    expect(
      resolveEffectiveMaximumRetailMarkupPercent(
        { ...baseRetailProduct, maximumRetailMarkupOverridePercent: 45 },
        category,
      ),
    ).toBe(45);
  });

  it('resolves wholesale override independently from retail', () => {
    expect(
      resolveEffectiveMaximumWholesaleMarkupPercent(
        { ...baseRetailProduct, maximumWholesaleMarkupOverridePercent: 22 },
        category,
      ),
    ).toBe(22);
    expect(resolveEffectiveMaximumRetailMarkupPercent(baseRetailProduct, category)).toBe(30);
  });

  it('builds retail row with calculated prices from branch price', () => {
    const row = buildRetailMarkupRow(baseRetailProduct, category, 1000);
    expect(row.minimumRetailPriceKgs).toBe(1100);
    expect(row.recommendedRetailPriceKgs).toBe(1200);
    expect(row.maximumRetailPriceKgs).toBe(1300);
    expect(row.maximumRetailMarkupSource).toBe(MaximumMarkupSource.INHERITED);
    expect(row.validationStatus).toBe('OK');
  });

  it('flags inherited maximum below recommended without override', () => {
    const row = buildRetailMarkupRow(
      { ...baseRetailProduct, recommendedRetailMarkupPercent: 35 },
      category,
      1000,
    );
    expect(row.validationStatus).toBe('ERROR');
    expect(row.validationErrors).toContain(MARKUP_VALIDATION_MESSAGES.INHERITED_MAX_MISMATCH);
  });

  it('allows CEO override to fix inherited mismatch', () => {
    const row = buildRetailMarkupRow(
      {
        ...baseRetailProduct,
        recommendedRetailMarkupPercent: 35,
        maximumRetailMarkupOverridePercent: 40,
      },
      category,
      1000,
    );
    expect(row.maximumRetailMarkupSource).toBe(MaximumMarkupSource.CEO_PRODUCT_OVERRIDE);
    expect(row.validationStatus).toBe('OK');
    expect(row.maximumRetailPriceKgs).toBe(1400);
  });

  it('validates wholesale markups independently', () => {
    const validation = validateWholesaleMarkups({
      minimumWholesaleMarkupPercent: 5,
      recommendedWholesaleMarkupPercent: 25,
      inheritedMaximumWholesaleMarkupPercent: 20,
      effectiveMaximumWholesaleMarkupPercent: 20,
      maximumWholesaleMarkupSource: MaximumMarkupSource.INHERITED,
    });
    expect(validation.validationStatus).toBe('ERROR');
    expect(validation.validationErrors).toContain(MARKUP_VALIDATION_MESSAGES.INHERITED_MAX_MISMATCH);
  });

  it('builds wholesale row without affecting retail values', () => {
    const row = buildWholesaleMarkupRow(baseRetailProduct, category, 1000);
    expect(row.recommendedWholesaleMarkupPercent).toBe(15);
    expect(row.maximumWholesaleMarkupSource).toBe(MaximumMarkupSource.INHERITED);
    expect(row.maximumWholesalePriceKgs).toBe(1200);
  });

  it('rejects negative minimum markup', () => {
    const validation = validateRetailMarkups({
      minimumRetailMarkupPercent: -1,
      recommendedRetailMarkupPercent: 10,
      inheritedMaximumRetailMarkupPercent: 30,
      effectiveMaximumRetailMarkupPercent: 30,
      maximumRetailMarkupSource: MaximumMarkupSource.INHERITED,
    });
    expect(validation.validationErrors).toContain(MARKUP_VALIDATION_MESSAGES.MIN_NEGATIVE);
  });
});
