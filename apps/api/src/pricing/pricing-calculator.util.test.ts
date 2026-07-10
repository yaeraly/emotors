import {
  applyHqBranchWholesaleMarkup,
  pricesFromMarkups,
  resolveBranchHqMarkupPercent,
  resolveBranchPurchasePrice,
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
});
