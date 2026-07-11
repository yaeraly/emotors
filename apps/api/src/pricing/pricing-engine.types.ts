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
  baseCostKgs: number;
  baseBranchPriceKgs: number;
  effectiveBranchPriceKgs: number;
  appliedRuleType: PricingAppliedRuleType;
  appliedRuleId: string | null;
  appliedAdjustmentMode: PricingAdjustmentMode | null;
  appliedAdjustmentValue: number | null;
  calculationSteps: PricingCalculationStep[];
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
