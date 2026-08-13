import { PricingAppliedRuleType } from '@prisma/client';
import { buildPriceExplanation } from './pricing-engine.types';
import { applyPricingRounding, DEFAULT_PRICING_ROUNDING } from './pricing-calculator.util';

describe('pricing master rounding config', () => {
  it('defaults to ROUNDUP tens', () => {
    expect(applyPricingRounding(1201, DEFAULT_PRICING_ROUNDING)).toBe(1210);
  });

  it('supports nearest rounding', () => {
    expect(
      applyPricingRounding(1204, {
        strategy: 'ROUND_NEAREST',
        roundUpPrecision: -1,
        decimalPrecision: 2,
      }),
    ).toBe(1200);
  });
});

describe('buildPriceExplanation', () => {
  it('builds ordered CEO explanation with previous/adjustment/result', () => {
    const explanation = buildPriceExplanation(
      {
        resolvedPriceKgs: 1145,
        pricingPolicyVersionId: 'v1',
        pricingProfileId: 'p1',
        pricingProfileName: 'Gold',
        baseCostKgs: 1000,
        costAvailable: true,
        costSource: 'HQ_FIFO_ACTIVE_LAYER',
        baseFranchiseMarkupPercent: 20,
        baseBranchPriceKgs: 1200,
        effectiveBranchPriceKgs: 1145,
        appliedRuleType: PricingAppliedRuleType.CATEGORY_RULE,
        appliedRuleId: 'cr1',
        appliedAdjustmentMode: 'PERCENTAGE_DISCOUNT',
        appliedAdjustmentValue: 2,
        categoryRulePercent: 2,
        productRuleMode: null,
        productRuleValue: null,
        pricingProfileDiscountPercent: null,
        temporaryOverrideApplied: false,
        calculationSteps: [],
      },
      {
        productId: 'prod1',
        branchId: 'br1',
        priceType: 'BRANCH_PURCHASE' as never,
        currency: 'KGS',
      },
    );

    expect(explanation.finalPriceKgs).toBe(1145);
    const fifo = explanation.lines.find((l) => l.key === 'fifoCost');
    const master = explanation.lines.find((l) => l.key === 'hqFranchiseMarkup');
    const category = explanation.lines.find((l) => l.key === 'categoryRule');
    expect(fifo?.resultingValueKgs).toBe(1000);
    expect(master?.previousValueKgs).toBe(1000);
    expect(master?.resultingValueKgs).toBe(1200);
    expect(category?.applied).toBe(true);
    expect(category?.previousValueKgs).toBe(1200);
    expect(category?.resultingValueKgs).toBe(1145);
    expect(explanation.lines.find((l) => l.key === 'temporaryOverride')?.detail).toBe('None');
  });
});
