import { BranchType, PricingEnginePriceType } from '@prisma/client';
import { HQ_CATALOG_BRANCH_CODE } from '../warehouse/warehouse.util';
import type { BranchTypeForPricing } from './pricing-calculator.util';

/** Customer-facing sale prices (retail / wholesale), not branch inventory purchase. */
export function isCustomerSalePriceType(priceType?: PricingEnginePriceType | null) {
  return Boolean(priceType && priceType !== PricingEnginePriceType.BRANCH_PURCHASE);
}

/** HQ Branch receives inventory at exact FIFO cost only for branch purchase pricing. */
export function shouldUseHqBranchInventoryCostForPriceType(
  branchType: BranchTypeForPricing,
  priceType: PricingEnginePriceType,
) {
  return branchType === 'HQ_BRANCH' && priceType === PricingEnginePriceType.BRANCH_PURCHASE;
}

export const SHARED_FRANCHISE_PRICING_BRANCH_WHERE = {
  deletedAt: null,
  code: { not: HQ_CATALOG_BRANCH_CODE },
  priceProfileId: { not: null },
  branchType: { not: BranchType.HQ_BRANCH },
};
