import {
  applyCategoryDiscountRoundUp,
  applyHqBranchWholesaleMarkup,
  applyMarkupRoundUp,
  dateRangesOverlap,
  isProductOverrideEffective,
  pricesFromMarkups,
  resolveBaseFranchiseBranchPrice,
  resolveBranchHqMarkupPercent,
  resolveBranchPurchasePrice,
  resolveFinalBranchProductPrice,
  resolveHqToBranchPrice,
} from './pricing-calculator.util';

describe('pricing-calculator.util', () => {
  it('HQ branch price always equals cost', () => {
    expect(resolveHqToBranchPrice(1234, 'HQ_BRANCH', 15)).toBe(1234);
    expect(resolveBranchPurchasePrice(1234, 'HQ_BRANCH', 15)).toBe(1234);
  });

  it('applies franchise markup with ROUNDUP to nearest 10', () => {
    expect(applyHqBranchWholesaleMarkup(1000, 15)).toBe(1160);
    expect(applyHqBranchWholesaleMarkup(1000, 0)).toBe(1000);
  });

  it('uses product base franchise markup only (profiles do not change markup)', () => {
    expect(
      resolveBranchHqMarkupPercent({
        branchType: 'FRANCHISE_BRANCH',
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
      branchType: 'FRANCHISE_BRANCH',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      overridePriceKgs: 2100,
      override: {
        status: 'ACTIVE',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-31'),
      },
      now: new Date('2026-07-15'),
    });
    expect(resolved.priceKgs).toBe(2100);
    expect(resolved.source).toBe('OVERRIDE');
  });

  it('VIP category discount applies after base franchise price', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE_BRANCH',
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
      branchType: 'FRANCHISE_BRANCH',
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
      branchType: 'FRANCHISE_BRANCH',
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
      branchType: 'FRANCHISE_BRANCH',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      overridePriceKgs: 2100,
      override,
      now: new Date('2026-07-30'),
    });
    const expiredPrice = resolveFinalBranchProductPrice({
      costPriceKgs: 2000,
      branchType: 'FRANCHISE_BRANCH',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 3,
      overridePriceKgs: 2100,
      override,
      now: new Date('2026-08-01'),
    });
    expect(activePrice.source).toBe('OVERRIDE');
    expect(expiredPrice.source).toBe('CATEGORY_DISCOUNT');
  });

  it('base franchise branch price uses ROUNDUP formula', () => {
    expect(resolveBaseFranchiseBranchPrice(2000, 'FRANCHISE_BRANCH', 20)).toBe(2400);
    expect(resolveBaseFranchiseBranchPrice(2000, 'HQ_BRANCH', 20)).toBe(2000);
  });

  it('retail price uses branch price as base', () => {
    const branchPrice = applyMarkupRoundUp(2000, 20);
    const retailPrice = applyMarkupRoundUp(branchPrice, 25);
    expect(branchPrice).toBe(2400);
    expect(retailPrice).toBe(3000);
  });
});
