import {
  applyCategoryDiscountRoundUp,
  applyHqBranchWholesaleMarkup,
  applyMarkupRoundUp,
  applyPricingAdjustment,
  dateRangesOverlap,
  isProductOverrideEffective,
  pricesFromMarkups,
  resolveBaseFranchiseBranchPrice,
  resolveBranchHqMarkupPercent,
  resolveBranchPurchasePrice,
  resolveFinalBranchProductPrice,
  resolveHqToBranchPrice,
  roundUpToTens,
  validateSellingPriceLimits,
} from './pricing-calculator.util';

describe('pricing-calculator.util', () => {
  it('HQ branch price always equals cost', () => {
    expect(resolveHqToBranchPrice(1234, 'HQ_BRANCH', 15)).toBe(1234);
    expect(resolveBranchPurchasePrice(1234, 'HQ_BRANCH', 15)).toBe(1234);
  });

  it('applies franchise markup with ROUNDUP to nearest 10', () => {
    expect(applyHqBranchWholesaleMarkup(1000, 15)).toBe(1160);
    expect(applyHqBranchWholesaleMarkup(1000, 0)).toBe(1000);
    expect(applyMarkupRoundUp(1000, 20)).toBe(1200);
    expect(applyMarkupRoundUp(1000, 35)).toBe(1350);
    expect(applyMarkupRoundUp(1000, 50)).toBe(1500);
  });

  it('rounds raw totals up to nearest 10 KGS', () => {
    expect(roundUpToTens(1201)).toBe(1210);
    expect(roundUpToTens(1210)).toBe(1210);
    expect(roundUpToTens(1211)).toBe(1220);
    expect(roundUpToTens(1250.01)).toBe(1260);
  });

  it('uses product base franchise markup only (profiles do not change markup)', () => {
    expect(
      resolveBranchHqMarkupPercent({
        branchType: 'FRANCHISE',
        productDefaultMarkupPercent: 20,
        profileMarkupPercent: 10,
        profileStatus: 'ACTIVE',
      }),
    ).toBe(20);
  });

  it('calculates retail and wholesale from branch purchase price', () => {
    const prices = pricesFromMarkups(1000, {
      hqBranchWholesaleMarkupPercent: 15,
      wholesaleMarkupPercent: 10,
      minimumWholesaleMarkupPercent: 5,
      recommendedRetailMarkupPercent: 25,
      minimumSellingMarkupPercent: 15,
    });
    expect(prices.hqBranchWholesalePriceKgs).toBe(1160);
    expect(prices.wholesalePriceKgs).toBe(1280);
    expect(prices.recommendedRetailPriceKgs).toBe(1450);
    expect(prices.minimumSellingPriceKgs).toBe(1340);
  });

  it('applies category discount on branch price with ROUNDUP', () => {
    expect(applyCategoryDiscountRoundUp(2400, 3)).toBe(2330);
    expect(applyCategoryDiscountRoundUp(2400, 0)).toBe(2400);
  });

  it('applies product rule modes', () => {
    expect(applyPricingAdjustment(2400, 'PERCENTAGE_DISCOUNT', 10)).toBe(2160);
    expect(applyPricingAdjustment(2400, 'FIXED_AMOUNT_DISCOUNT', 100)).toBe(2300);
    expect(applyPricingAdjustment(2400, 'FIXED_SELLING_PRICE', 2100)).toBe(2100);
  });

  it('product rule overrides category rule in resolver', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      productRule: { mode: 'FIXED_SELLING_PRICE', value: 2100 },
    });
    expect(resolved.priceKgs).toBe(2100);
    expect(resolved.source).toBe('PRODUCT_RULE');
  });

  it('detects overlapping date ranges', () => {
    const startA = new Date('2026-07-01');
    const endA = new Date('2026-07-31');
    const startB = new Date('2026-07-15');
    const endB = new Date('2026-08-15');
    expect(dateRangesOverlap(startA, endA, startB, endB)).toBe(true);
    expect(dateRangesOverlap(startA, endA, new Date('2026-08-01'), endB)).toBe(false);
  });

  it('active override has highest priority', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      override: { mode: 'FIXED_SELLING_PRICE', value: 2100 },
    });
    expect(resolved.priceKgs).toBe(2100);
    expect(resolved.source).toBe('OVERRIDE');
  });

  it('VIP category discount applies after base franchise price', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
    });
    expect(resolved.baseFranchisePriceKgs).toBe(2400);
    expect(resolved.priceKgs).toBe(2330);
    expect(resolved.source).toBe('CATEGORY_DISCOUNT');
  });

  it('standard franchise uses base franchise price without discount', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 0,
    });
    expect(resolved.source).toBe('BASE_FRANCHISE');
    expect(resolved.priceKgs).toBe(applyHqBranchWholesaleMarkup(1000, 20));
  });

  it('HQ branch always buys at cost price', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 1234,
      branchType: 'HQ_BRANCH',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 5,
    });
    expect(resolved.priceKgs).toBe(1234);
    expect(resolved.source).toBe('HQ_COST');
  });

  it('expired override reverts to category discount pricing', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      overridePriceKgs: 2100,
      override: {
        status: 'EXPIRED',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-31'),
      },
      now: new Date('2026-07-15'),
    });
    expect(resolved.source).toBe('CATEGORY_DISCOUNT');
    expect(resolved.priceKgs).toBe(2330);
  });

  it('automatic recalculation works after expiration date passes', () => {
    const override = {
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
    };
    expect(isProductOverrideEffective(override, new Date('2026-07-30'))).toBe(true);
    expect(isProductOverrideEffective(override, new Date('2026-08-01'))).toBe(false);

    const activePrice = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      overridePriceKgs: 2100,
      override,
      now: new Date('2026-07-15'),
    });
    expect(activePrice.priceKgs).toBe(2100);

    const expiredPrice = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      overridePriceKgs: 2100,
      override,
      now: new Date('2026-08-01'),
    });
    expect(expiredPrice.source).toBe('CATEGORY_DISCOUNT');
  });

  it('base franchise markup 20% and 100% remain product-specific', () => {
    expect(resolveBaseFranchiseBranchPrice(1000, 'FRANCHISE', 20)).toBe(1200);
    expect(resolveBaseFranchiseBranchPrice(1000, 'FRANCHISE', 100)).toBe(2000);
  });

  it('HQ branch with zero markup uses exact cost', () => {
    expect(applyHqBranchWholesaleMarkup(1234, 0)).toBe(1234);
    expect(resolveBaseFranchiseBranchPrice(1234, 'HQ_BRANCH', 0)).toBe(1234);
  });

  it('validates selling price limits', () => {
    expect(
      validateSellingPriceLimits({
        unitPrice: 900,
        minimumPriceKgs: 1000,
        recommendedPriceKgs: 1200,
      }).ok,
    ).toBe(false);
    expect(
      validateSellingPriceLimits({
        unitPrice: 1300,
        minimumPriceKgs: 1000,
        recommendedPriceKgs: 1200,
      }),
    ).toEqual({ ok: true, warning: true, message: 'Цена выше рекомендуемой. Укажите причину.' });
    expect(
      validateSellingPriceLimits({
        unitPrice: 1500,
        minimumPriceKgs: 1000,
        recommendedPriceKgs: 1200,
        maximumPriceKgs: 1400,
        maximumEnabled: true,
      }).ok,
    ).toBe(false);
    expect(
      validateSellingPriceLimits({
        unitPrice: 1100,
        minimumPriceKgs: 1000,
        recommendedPriceKgs: 1200,
        maximumEnabled: false,
      }),
    ).toEqual({ ok: true, warning: false });
  });

  it('calculates maximum retail and wholesale prices when enabled', () => {
    const prices = pricesFromMarkups(1000, {
      hqBranchWholesaleMarkupPercent: 20,
      wholesaleMarkupPercent: 10,
      minimumWholesaleMarkupPercent: 5,
      recommendedRetailMarkupPercent: 25,
      minimumSellingMarkupPercent: 15,
      enableMaximumRetailPrice: true,
      maximumRetailMarkupPercent: 40,
      enableMaximumWholesalePrice: true,
      maximumWholesaleMarkupPercent: 30,
    });
    expect(prices.maximumRetailPriceKgs).toBe(1680);
    expect(prices.maximumWholesalePriceKgs).toBe(1560);
  });

  it('warns above maximum when policy is WARNING_ONLY', () => {
    expect(
      validateSellingPriceLimits({
        unitPrice: 1500,
        minimumPriceKgs: 1000,
        recommendedPriceKgs: 1200,
        maximumPriceKgs: 1400,
        maximumPolicy: 'WARNING_ONLY',
      }),
    ).toEqual({
      ok: true,
      warning: true,
      message: 'Цена выше максимальной. Укажите причину.',
    });
  });
});
