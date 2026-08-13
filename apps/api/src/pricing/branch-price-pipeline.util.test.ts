/**
 * Mirrors PricingEngineService BRANCH_PURCHASE math: raw adjustments, single final ROUNDUP.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPricingAdjustmentRaw,
  applyPricingRounding,
  calculateBaseBranchPriceKgsRaw,
  DEFAULT_PRICING_ROUNDING,
  resolveFinalBranchProductPriceWithProfile,
} from './pricing-calculator.util';

function resolveBranchPurchaseFinal(
  costPriceKgs: number,
  baseFranchiseMarkupPercent: number,
  options?: {
    categoryDiscountPercent?: number;
    profileDiscountPercent?: number;
    productRule?: {
      mode: 'PERCENTAGE_DISCOUNT' | 'FIXED_AMOUNT_DISCOUNT' | 'FIXED_SELLING_PRICE';
      value: number;
    };
    override?: {
      mode: 'PERCENTAGE_DISCOUNT' | 'FIXED_AMOUNT_DISCOUNT' | 'FIXED_SELLING_PRICE';
      value: number;
    };
  },
) {
  const baseRaw = calculateBaseBranchPriceKgsRaw({
    costPriceKgs,
    markupPercent: baseFranchiseMarkupPercent,
    branchType: 'FRANCHISE',
  });

  if (options?.override) {
    const effective = applyPricingAdjustmentRaw(baseRaw, options.override.mode, options.override.value);
    return applyPricingRounding(effective, DEFAULT_PRICING_ROUNDING);
  }

  if (options?.productRule) {
    const effective = applyPricingAdjustmentRaw(
      baseRaw,
      options.productRule.mode,
      options.productRule.value,
    );
    return applyPricingRounding(effective, DEFAULT_PRICING_ROUNDING);
  }

  if (options?.categoryDiscountPercent && options.categoryDiscountPercent > 0) {
    const effective = applyPricingAdjustmentRaw(
      baseRaw,
      'PERCENTAGE_DISCOUNT',
      options.categoryDiscountPercent,
    );
    return applyPricingRounding(effective, DEFAULT_PRICING_ROUNDING);
  }

  if (options?.profileDiscountPercent && options.profileDiscountPercent > 0) {
    const effective = applyPricingAdjustmentRaw(
      baseRaw,
      'PERCENTAGE_DISCOUNT',
      options.profileDiscountPercent,
    );
    return applyPricingRounding(effective, DEFAULT_PRICING_ROUNDING);
  }

  return applyPricingRounding(baseRaw, DEFAULT_PRICING_ROUNDING);
}

describe('branch purchase single-roundup pipeline', () => {
  it('matches franchise base markup with one ROUNDUP at the end', () => {
    assert.equal(resolveBranchPurchaseFinal(850, 20), 1020);
    assert.equal(resolveBranchPurchaseFinal(842.5, 20), 1020);
  });

  it('applies category discount on raw base before single ROUNDUP', () => {
    const cost = 834.25;
    const withDiscount = resolveBranchPurchaseFinal(cost, 20, { categoryDiscountPercent: 1 });
    const withoutDiscount = resolveBranchPurchaseFinal(cost, 20);
    assert.equal(withoutDiscount, 1010);
    assert.equal(withDiscount, 1000);
    assert.notEqual(withDiscount, withoutDiscount);
  });

  it('applies product rule before category rule in legacy helper parity', () => {
    const resolved = resolveFinalBranchProductPriceWithProfile({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      categoryDiscountPercent: 5,
      productRule: { mode: 'PERCENTAGE_DISCOUNT', value: 10 },
    });
    assert.equal(resolved.source, 'PRODUCT_RULE');
    assert.equal(
      resolveBranchPurchaseFinal(1000, 20, {
        productRule: { mode: 'PERCENTAGE_DISCOUNT', value: 10 },
        categoryDiscountPercent: 5,
      }),
      1080,
    );
  });

  it('applies temporary override before product rule in legacy helper parity', () => {
    const resolved = resolveFinalBranchProductPriceWithProfile({
      costPriceKgs: 1000,
      branchType: 'FRANCHISE',
      baseFranchiseMarkupPercent: 20,
      productRule: { mode: 'PERCENTAGE_DISCOUNT', value: 10 },
      override: { mode: 'FIXED_SELLING_PRICE', value: 1020 },
    });
    assert.equal(resolved.source, 'OVERRIDE');
    assert.equal(
      resolveBranchPurchaseFinal(1000, 20, {
        override: { mode: 'FIXED_SELLING_PRICE', value: 1020 },
        productRule: { mode: 'PERCENTAGE_DISCOUNT', value: 10 },
      }),
      1020,
    );
  });
});
