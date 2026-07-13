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

export function buildPriceExplanation(
  result: PricingEngineResolveResult,
  input: {
    productId: string;
    branchId: string;
    priceType: PricingEnginePriceType;
    currency: string;
  },
): PriceExplanationResult {
  const lines: PriceExplanationLine[] = [
    {
      key: 'fifoCost',
      label: 'FIFO Cost',
      valueKgs: result.baseCostKgs,
      percent: null,
      detail: null,
      applied: true,
    },
    {
      key: 'hqFranchiseMarkup',
      label: 'HQ Franchise Markup',
      valueKgs: result.baseBranchPriceKgs,
      percent: result.baseFranchiseMarkupPercent,
      detail: `+${result.baseFranchiseMarkupPercent}%`,
      applied: result.baseFranchiseMarkupPercent !== 0 || result.baseBranchPriceKgs !== result.baseCostKgs,
    },
    {
      key: 'categoryRule',
      label: 'Category Rule',
      valueKgs:
        result.appliedRuleType === PricingAppliedRuleType.CATEGORY_RULE
          ? result.effectiveBranchPriceKgs
          : null,
      percent: result.categoryRulePercent,
      detail:
        result.categoryRulePercent != null ? `${result.categoryRulePercent}%` : 'None',
      applied: result.appliedRuleType === PricingAppliedRuleType.CATEGORY_RULE,
    },
    {
      key: 'productRule',
      label: 'Product Rule',
      valueKgs:
        result.appliedRuleType === PricingAppliedRuleType.PRODUCT_RULE
          ? result.effectiveBranchPriceKgs
          : null,
      percent: result.productRuleValue,
      detail:
        result.productRuleMode && result.productRuleValue != null
          ? `${result.productRuleMode}=${result.productRuleValue}`
          : 'None',
      applied: result.appliedRuleType === PricingAppliedRuleType.PRODUCT_RULE,
    },
    {
      key: 'pricingProfile',
      label: 'Pricing Profile Discount',
      valueKgs:
        result.appliedRuleType === PricingAppliedRuleType.PRICING_PROFILE
          ? result.effectiveBranchPriceKgs
          : null,
      percent: result.pricingProfileDiscountPercent,
      detail:
        result.pricingProfileDiscountPercent != null
          ? `-${result.pricingProfileDiscountPercent}%`
          : result.pricingProfileName
            ? result.pricingProfileName
            : 'None',
      applied: result.appliedRuleType === PricingAppliedRuleType.PRICING_PROFILE,
    },
    {
      key: 'temporaryOverride',
      label: 'Temporary Override',
      valueKgs:
        result.appliedRuleType === PricingAppliedRuleType.TEMP_OVERRIDE
          ? result.effectiveBranchPriceKgs
          : null,
      percent: result.appliedAdjustmentValue,
      detail: result.temporaryOverrideApplied
        ? `${result.appliedAdjustmentMode ?? ''}=${result.appliedAdjustmentValue ?? ''}`
        : 'None',
      applied: result.temporaryOverrideApplied,
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
      valueKgs: result.resolvedPriceKgs,
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
    finalPriceKgs: result.resolvedPriceKgs,
    appliedRuleType: result.appliedRuleType,
    appliedRuleId: result.appliedRuleId,
    pricingPolicyVersionId: result.pricingPolicyVersionId,
    pricingProfileId: result.pricingProfileId,
    pricingProfileName: result.pricingProfileName,
    resolve: result,
  };
}
