import { Injectable } from '@nestjs/common';
import { BranchType, CustomerType, PricingAppliedRuleType, PricingEnginePriceType } from '@prisma/client';
import { PricingEngineService } from '../pricing/pricing-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveDefaultPriceProfileId,
} from '../pricing/pricing-profile-defaults.util';
import type { BranchTypeForPricing } from '../pricing/pricing-calculator.util';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';

export type B2bCustomerType = typeof CustomerType.DEALER | typeof CustomerType.DISTRIBUTOR;

export type HqB2bPriceResolution = {
  productId: string;
  customerType: CustomerType;
  costPrice: number | null;
  basePrice: number;
  finalSellingPrice: number;
  priceProfileId: string | null;
  pricingPolicyVersionId: string | null;
  pricingSource: string | null;
  priceConfigured: boolean;
  priceMissingReason: string | null;
  appliedRuleType: PricingAppliedRuleType | null;
  appliedRuleId: string | null;
};

const CUSTOMER_TYPE_TO_BRANCH: Record<B2bCustomerType, BranchType> = {
  [CustomerType.DEALER]: BranchType.DEALER,
  [CustomerType.DISTRIBUTOR]: BranchType.DISTRIBUTOR,
};

function mapPricingSource(appliedRuleType: PricingAppliedRuleType | null): string | null {
  if (!appliedRuleType) return null;
  switch (appliedRuleType) {
    case PricingAppliedRuleType.TEMP_OVERRIDE:
      return 'TEMPORARY_OVERRIDE';
    case PricingAppliedRuleType.PRODUCT_RULE:
      return 'PRODUCT_RULE';
    case PricingAppliedRuleType.CATEGORY_RULE:
      return 'CATEGORY_RULE';
    case PricingAppliedRuleType.PRICING_PROFILE:
      return 'PRICE_PROFILE';
    case PricingAppliedRuleType.BASE_FRANCHISE:
      return 'BASE_B2B';
    default:
      return appliedRuleType;
  }
}

@Injectable()
export class HqB2bPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  async resolveHqBranchId(): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: { code: HQ_CATALOG_BRANCH_CODE, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new Error('HQ catalog branch not found');
    return branch.id;
  }

  async resolveProfileIdForCustomerType(customerType: B2bCustomerType) {
    const branchType = CUSTOMER_TYPE_TO_BRANCH[customerType];
    return resolveDefaultPriceProfileId(this.prisma, branchType);
  }

  async resolveSellingPrice(
    productId: string,
    customerType: B2bCustomerType,
  ): Promise<HqB2bPriceResolution> {
    const hqBranchId = await this.resolveHqBranchId();
    const branchType = CUSTOMER_TYPE_TO_BRANCH[customerType] as BranchTypeForPricing;
    const profileId = await this.resolveProfileIdForCustomerType(customerType);

    if (!profileId) {
      return {
        productId,
        customerType,
        costPrice: null,
        basePrice: 0,
        finalSellingPrice: 0,
        priceProfileId: null,
        pricingPolicyVersionId: null,
        pricingSource: null,
        priceConfigured: false,
        priceMissingReason: 'NO_PRICE_PROFILE',
        appliedRuleType: null,
        appliedRuleId: null,
      };
    }

    const result = await this.pricingEngine.resolvePrice({
      productId,
      branchId: hqBranchId,
      priceType: PricingEnginePriceType.WHOLESALE_RECOMMENDED,
      pricingProfileIdOverride: profileId,
      branchTypeOverride: branchType,
    });

    const priceConfigured = Boolean(result.costAvailable && result.resolvedPriceKgs > 0);

    return {
      productId,
      customerType,
      costPrice: result.costAvailable ? result.baseCostKgs : null,
      basePrice: result.effectiveBranchPriceKgs,
      finalSellingPrice: result.resolvedPriceKgs,
      priceProfileId: result.pricingProfileId ?? profileId,
      pricingPolicyVersionId: result.pricingPolicyVersionId,
      pricingSource: mapPricingSource(result.appliedRuleType),
      priceConfigured,
      priceMissingReason: priceConfigured
        ? null
        : result.costAvailable
          ? 'PRICE_NOT_CONFIGURED'
          : 'NO_FIFO_COST',
      appliedRuleType: result.appliedRuleType,
      appliedRuleId: result.appliedRuleId,
    };
  }
}
