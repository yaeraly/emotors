import {
  applyHqBranchWholesaleMarkup,
  dateRangesOverlap,
  isProductOverrideEffective,
  pricesFromMarkups,
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

  it('uses profile markup before product default markup', () => {
    expect(
      resolveBranchHqMarkupPercent({
        branchType: 'FRANCHISE_BRANCH',
        productDefaultMarkupPercent: 20,
        profileMarkupPercent: 10,
        profileStatus: 'ACTIVE',
      }),
    ).toBe(10);
    expect(
      resolveBranchHqMarkupPercent({
        branchType: 'FRANCHISE_BRANCH',
        productDefaultMarkupPercent: 20,
        profileMarkupPercent: null,
        profileStatus: null,
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

  it('detects overlapping date ranges', () => {
    const startA = new Date('2026-07-01');
    const endA = new Date('2026-07-31');
    const startB = new Date('2026-07-15');
    const endB = new Date('2026-08-15');
    expect(dateRangesOverlap(startA, endA, startB, endB)).toBe(true);
    expect(dateRangesOverlap(startA, endA, new Date('2026-08-01'), endB)).toBe(false);
  });

  it('active override replaces profile price', () => {
    const now = new Date('2026-07-15');
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE_BRANCH',
      productDefaultMarkupPercent: 20,
      profileMarkupPercent: 15,
      profileStatus: 'ACTIVE',
      overridePriceKgs: 900,
      override: {
        status: 'ACTIVE',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-31'),
      },
      now,
    });
    expect(resolved.priceKgs).toBe(900);
    expect(resolved.source).toBe('OVERRIDE');
  });

  it('expired override reverts to profile pricing', () => {
    const now = new Date('2026-08-01');
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE_BRANCH',
      productDefaultMarkupPercent: 20,
      profileMarkupPercent: 10,
      profileStatus: 'ACTIVE',
      overridePriceKgs: 900,
      override: {
        status: 'EXPIRED',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-31'),
      },
      now,
    });
    expect(resolved.source).toBe('PROFILE');
    expect(resolved.priceKgs).toBe(applyHqBranchWholesaleMarkup(1000, 10));
  });

  it('cancelled override reverts to product default markup when profile inactive', () => {
    const now = new Date('2026-07-15');
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE_BRANCH',
      productDefaultMarkupPercent: 20,
      profileMarkupPercent: null,
      profileStatus: null,
      overridePriceKgs: 900,
      override: {
        status: 'CANCELLED',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-31'),
      },
      now,
    });
    expect(resolved.source).toBe('PRODUCT_DEFAULT');
    expect(resolved.priceKgs).toBe(applyHqBranchWholesaleMarkup(1000, 20));
  });

  it('automatic recalculation works after expiration date passes', () => {
    const beforeExpiry = new Date('2026-07-30');
    const afterExpiry = new Date('2026-08-01');
    const override = {
      status: 'ACTIVE',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
    };
    expect(isProductOverrideEffective(override, beforeExpiry)).toBe(true);
    expect(isProductOverrideEffective(override, afterExpiry)).toBe(false);

    const activePrice = resolveFinalBranchProductPrice({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE_BRANCH',
      productDefaultMarkupPercent: 20,
      profileMarkupPercent: 10,
      profileStatus: 'ACTIVE',
      overridePriceKgs: 850,
      override,
      now: beforeExpiry,
    });
    const expiredPrice = resolveFinalBranchProductPrice({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE_BRANCH',
      productDefaultMarkupPercent: 20,
      profileMarkupPercent: 10,
      profileStatus: 'ACTIVE',
      overridePriceKgs: 850,
      override,
      now: afterExpiry,
    });
    expect(activePrice.source).toBe('OVERRIDE');
    expect(expiredPrice.source).toBe('PROFILE');
    expect(expiredPrice.priceKgs).not.toBe(850);
  });

  it('HQ branch always uses cost when no override', () => {
    const resolved = resolveFinalBranchProductPrice({
      costPriceKgs: 1234,
      branchType: 'HQ_BRANCH',
      productDefaultMarkupPercent: 15,
      profileMarkupPercent: 10,
      profileStatus: 'ACTIVE',
    });
    expect(resolved.priceKgs).toBe(1234);
    expect(resolved.source).toBe('HQ_COST');
  });
});
