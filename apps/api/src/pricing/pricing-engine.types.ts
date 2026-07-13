import {
  PricingAdjustmentMode,
  PricingAppliedRuleType,
  PricingEnginePriceType,
} from '@prisma/client';

export type PricingCalculationStep = {
  step: string;
  valueKgs: number;
  detail?: string;
};

export type PricingEngineResolveInput = {
  productId: string;
  branchId: string;
  priceType?: PricingEnginePriceType;
  documentDate?: Date;
  pricingPolicyVersionId?: string | null;
};

export type PricingEngineResolveResult = {
  resolvedPriceKgs: number;
  pricingPolicyVersionId: string | null;
  pricingProfileId: string | null;
  pricingProfileName: string | null;
  baseCostKgs: number;
  baseFranchiseMarkupPercent: number;
  baseBranchPriceKgs: number;
  effectiveBranchPriceKgs: number;
  appliedRuleType: PricingAppliedRuleType;
  appliedRuleId: string | null;
  appliedAdjustmentMode: PricingAdjustmentMode | null;
  appliedAdjustmentValue: number | null;
  categoryRulePercent: number | null;
  productRuleMode: PricingAdjustmentMode | null;
  productRuleValue: number | null;
  pricingProfileDiscountPercent: number | null;
  temporaryOverrideApplied: boolean;
  calculationSteps: PricingCalculationStep[];
};

export type PriceExplanationLine = {
  key: string;
  label: string;
  previousValueKgs: number | null;
  adjustment: string | null;
  resultingValueKgs: number | null;
  valueKgs: number | null;
  percent: number | null;
  detail: string | null;
  applied: boolean;
};

export type PriceExplanationResult = {
  productId: string;
  branchId: string;
  priceType: PricingEnginePriceType;
  currency: string;
  lines: PriceExplanationLine[];
  finalPriceKgs: number;
  appliedRuleType: PricingAppliedRuleType;
  appliedRuleId: string | null;
  pricingPolicyVersionId: string | null;
  pricingProfileId: string | null;
  pricingProfileName: string | null;
  resolve: PricingEngineResolveResult;
};

export type PriceFreezePayload = {
  pricingPolicyVersionId: string | null;
  pricingProfileId: string | null;
  resolvedPriceKgs: number;
  baseCostKgs: number;
  baseBranchPriceKgs: number;
  appliedRuleType: PricingAppliedRuleType;
  appliedRuleId: string | null;
  appliedAdjustmentMode: PricingAdjustmentMode | null;
  appliedAdjustmentValue: number | null;
  priceResolvedAt: Date;
};

export function toPriceFreezePayload(result: PricingEngineResolveResult): PriceFreezePayload {
  return {
    pricingPolicyVersionId: result.pricingPolicyVersionId,
    pricingProfileId: result.pricingProfileId,
    resolvedPriceKgs: result.resolvedPriceKgs,
    baseCostKgs: result.baseCostKgs,
    baseBranchPriceKgs: result.baseBranchPriceKgs,
    appliedRuleType: result.appliedRuleType,
    appliedRuleId: result.appliedRuleId,
    appliedAdjustmentMode: result.appliedAdjustmentMode,
    appliedAdjustmentValue: result.appliedAdjustmentValue,
    priceResolvedAt: new Date(),
  };
}

function formatAdjustment(mode: PricingAdjustmentMode | null, value: number | null, asDiscount = false) {
  if (mode == null || value == null) return 'None';
  if (mode === 'PERCENTAGE_DISCOUNT') return asDiscount ? `-${value}%` : `${value}%`;
  if (mode === 'FIXED_AMOUNT_DISCOUNT') return `-${value}`;
  if (mode === 'FIXED_SELLING_PRICE') return `= ${value}`;
  return String(value);
}

/**
 * Ordered CEO explanation pipeline generated only from Engine result (no FE formulas).
 * FIFO → Master Franchise → Profile → Category Rule → Product Rule → Override → Final
 */
export function buildPriceExplanation(
  result: PricingEngineResolveResult,
  input: {
    productId: string;
    branchId: string;
    priceType: PricingEnginePriceType;
    currency: string;
  },
): PriceExplanationResult {
  const fifo = result.baseCostKgs;
  const master = result.baseBranchPriceKgs;
  const effective = result.effectiveBranchPriceKgs;
  const finalPrice = result.resolvedPriceKgs;

  const profileApplied = result.appliedRuleType === PricingAppliedRuleType.PRICING_PROFILE;
  const categoryApplied = result.appliedRuleType === PricingAppliedRuleType.CATEGORY_RULE;
  const productApplied = result.appliedRuleType === PricingAppliedRuleType.PRODUCT_RULE;
  const overrideApplied = result.temporaryOverrideApplied;

  const lines: PriceExplanationLine[] = [
    {
      key: 'fifoCost',
      label: 'FIFO Cost',
      previousValueKgs: null,
      adjustment: null,
      resultingValueKgs: fifo,
      valueKgs: fifo,
      percent: null,
      detail: null,
      applied: true,
    },
    {
      key: 'hqFranchiseMarkup',
      label: 'Master Franchise Markup',
      previousValueKgs: fifo,
      adjustment: `+${result.baseFranchiseMarkupPercent}%`,
      resultingValueKgs: master,
      valueKgs: master,
      percent: result.baseFranchiseMarkupPercent,
      detail: `+${result.baseFranchiseMarkupPercent}%`,
      applied: true,
    },
    {
      key: 'pricingProfile',
      label: 'Pricing Profile',
      previousValueKgs: master,
      adjustment: profileApplied
        ? formatAdjustment('PERCENTAGE_DISCOUNT', result.pricingProfileDiscountPercent, true)
        : result.pricingProfileName
          ? result.pricingProfileName
          : 'None',
      resultingValueKgs: profileApplied ? effective : master,
      valueKgs: profileApplied ? effective : null,
      percent: result.pricingProfileDiscountPercent,
      detail: profileApplied
        ? `-${result.pricingProfileDiscountPercent}%`
        : result.pricingProfileName ?? 'None',
      applied: profileApplied,
    },
    {
      key: 'categoryRule',
      label: 'Category Rule',
      previousValueKgs: master,
      adjustment: categoryApplied
        ? formatAdjustment('PERCENTAGE_DISCOUNT', result.categoryRulePercent, true)
        : 'None',
      resultingValueKgs: categoryApplied ? effective : null,
      valueKgs: categoryApplied ? effective : null,
      percent: result.categoryRulePercent,
      detail: categoryApplied ? `-${result.categoryRulePercent}%` : 'None',
      applied: categoryApplied,
    },
    {
      key: 'productRule',
      label: 'Product Rule',
      previousValueKgs: master,
      adjustment: productApplied
        ? formatAdjustment(result.productRuleMode, result.productRuleValue)
        : 'None',
      resultingValueKgs: productApplied ? effective : null,
      valueKgs: productApplied ? effective : null,
      percent: result.productRuleValue,
      detail: productApplied
        ? formatAdjustment(result.productRuleMode, result.productRuleValue)
        : 'None',
      applied: productApplied,
    },
    {
      key: 'temporaryOverride',
      label: 'Temporary Override',
      previousValueKgs: master,
      adjustment: overrideApplied
        ? formatAdjustment(result.appliedAdjustmentMode, result.appliedAdjustmentValue)
        : 'None',
      resultingValueKgs: overrideApplied ? effective : null,
      valueKgs: overrideApplied ? effective : null,
      percent: result.appliedAdjustmentValue,
      detail: overrideApplied
        ? formatAdjustment(result.appliedAdjustmentMode, result.appliedAdjustmentValue)
        : 'None',
      applied: overrideApplied,
    },
    {
      key: 'finalPrice',
      label:
        input.priceType === PricingEnginePriceType.BRANCH_PURCHASE
          ? 'Final Branch Price'
          : input.priceType.startsWith('RETAIL')
            ? 'Final Retail Price'
            : input.priceType.startsWith('WHOLESALE')
              ? 'Final Wholesale Price'
              : 'Final Selling Price',
      previousValueKgs: effective,
      adjustment:
        input.priceType === PricingEnginePriceType.BRANCH_PURCHASE
          ? null
          : input.priceType,
      resultingValueKgs: finalPrice,
      valueKgs: finalPrice,
      percent: null,
      detail: null,
      applied: true,
    },
  ];

  return {
    productId: input.productId,
    branchId: input.branchId,
    priceType: input.priceType,
    currency: input.currency,
    lines,
    finalPriceKgs: finalPrice,
    appliedRuleType: result.appliedRuleType,
    appliedRuleId: result.appliedRuleId,
    pricingPolicyVersionId: result.pricingPolicyVersionId,
    pricingProfileId: result.pricingProfileId,
    pricingProfileName: result.pricingProfileName,
    resolve: result,
  };
}
