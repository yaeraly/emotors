import { PricingAppliedRuleType } from '@prisma/client';
import { applyHqBranchWholesaleMarkup } from './pricing-calculator.util';

export type FranchiseSalesCatalogProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  category: string | null;
  isActive: boolean;
  updatedAt: Date;
  hqBranchWholesaleMarkupPercent: unknown;
  hqBranchWholesalePriceKgs: unknown;
  productCategory?: {
    nameRu: string | null;
    nameEn: string | null;
  } | null;
};

export type FranchiseSalesFifoCost = {
  available: boolean;
  costPriceKgs: number;
  source?: string;
  batchId?: string | null;
};

export type FranchiseSalesEngineResolution = {
  baseFranchiseMarkupPercent: number;
  baseBranchPriceKgs: number;
  resolvedPriceKgs: number;
  pricingPolicyVersionId: string | null;
  pricingPolicyVersionNumber?: number | null;
  pricingProfileId: string | null;
  appliedRuleType: PricingAppliedRuleType | null;
  costSource?: string;
} | null;

export function mapAppliedRuleToFranchisePricingSource(
  appliedRuleType: PricingAppliedRuleType | null | undefined,
): string | null {
  if (!appliedRuleType) return null;
  switch (appliedRuleType) {
    case PricingAppliedRuleType.TEMP_OVERRIDE:
      return 'BRANCH_PRODUCT_OVERRIDE';
    case PricingAppliedRuleType.PRODUCT_RULE:
      return 'BRANCH_PROFILE_PRODUCT_RULE';
    case PricingAppliedRuleType.CATEGORY_RULE:
      return 'BRANCH_PROFILE_CATEGORY_RULE';
    case PricingAppliedRuleType.PRICING_PROFILE:
      return 'CATEGORY_POLICY';
    case PricingAppliedRuleType.HQ_COST:
      return 'HQ_BRANCH_COST';
    case PricingAppliedRuleType.BASE_FRANCHISE:
      return 'DEFAULT_BRANCH_SALE_RULE';
    default:
      return 'DEFAULT_BRANCH_SALE_RULE';
  }
}

/**
 * Build one franchise-sales catalog row from HQ catalog product data.
 * Pricing-policy / FIFO / engine data are optional — products without them still return a row.
 */
export function buildFranchiseSalesCatalogRow(
  product: FranchiseSalesCatalogProduct,
  fifoCost: FranchiseSalesFifoCost,
  engine: FranchiseSalesEngineResolution,
  displayBranch: { id: string; name: string } | null,
) {
  const costAvailable = Boolean(fifoCost.available && fifoCost.costPriceKgs > 0);
  const costPriceKgs = costAvailable ? fifoCost.costPriceKgs : null;

  const storedMarkupPercent = Number(product.hqBranchWholesaleMarkupPercent);
  const storedBranchPriceKgs = Number(product.hqBranchWholesalePriceKgs);
  const engineMarkupPercent = engine ? Number(engine.baseFranchiseMarkupPercent ?? 0) : 0;

  const baseFranchiseMarkupPercent =
    storedMarkupPercent > 0
      ? storedMarkupPercent
      : engineMarkupPercent > 0
        ? engineMarkupPercent
        : storedMarkupPercent;
  const hqMarkupPercent = baseFranchiseMarkupPercent;

  let finalBranchPriceKgs =
    engine && engine.resolvedPriceKgs > 0 ? engine.resolvedPriceKgs : null;
  if (!finalBranchPriceKgs && storedBranchPriceKgs > 0) {
    finalBranchPriceKgs = storedBranchPriceKgs;
  }
  if (!finalBranchPriceKgs && costPriceKgs && baseFranchiseMarkupPercent > 0) {
    finalBranchPriceKgs = applyHqBranchWholesaleMarkup(costPriceKgs, baseFranchiseMarkupPercent);
  }

  const branchPriceKgs = finalBranchPriceKgs;
  const baseFranchisePriceKgs =
    engine && engine.baseBranchPriceKgs > 0
      ? engine.baseBranchPriceKgs
      : storedBranchPriceKgs > 0
        ? storedBranchPriceKgs
        : branchPriceKgs;

  const priceConfigured = Boolean(
    branchPriceKgs != null &&
      branchPriceKgs > 0 &&
      (baseFranchiseMarkupPercent > 0 || storedBranchPriceKgs > 0),
  );

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    categoryId: product.categoryId,
    categoryName:
      product.productCategory?.nameRu ??
      product.productCategory?.nameEn ??
      product.category ??
      '-',
    isActive: product.isActive,
    costPriceKgs,
    costAvailable,
    costSource: engine?.costSource ?? fifoCost.source ?? 'NO_FIFO_LAYER',
    costBatchId: fifoCost.batchId ?? null,
    markupConfigured: baseFranchiseMarkupPercent > 0,
    hqMarkupPercent,
    baseFranchiseMarkupPercent,
    recommendedMarkupPercent: baseFranchiseMarkupPercent > 0 ? hqMarkupPercent : null,
    branchPriceKgs,
    finalBranchPriceKgs,
    baseFranchisePriceKgs,
    masterBranchPriceKgs: branchPriceKgs,
    effectiveBranchPriceKgs: branchPriceKgs,
    recommendedBranchPriceKgs: branchPriceKgs,
    priceConfigured,
    pricingSource: mapAppliedRuleToFranchisePricingSource(engine?.appliedRuleType),
    branchPriceProfileId: engine?.pricingProfileId ?? null,
    pricingPolicyVersionId: engine?.pricingPolicyVersionId ?? null,
    pricingPolicyVersionNumber: engine?.pricingPolicyVersionNumber ?? null,
    displayBranchId: displayBranch?.id ?? null,
    displayBranchName: displayBranch?.name ?? null,
    lastUpdated: product.updatedAt,
  };
}

export function filterActiveCatalogProducts<T extends { isActive: boolean }>(products: T[]): T[] {
  return products.filter((product) => product.isActive);
}

export function filterFranchiseSalesCatalogRows<
  T extends { name: string; sku: string; categoryName: string },
>(rows: T[], search: string, categoryFilter: string): T[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (categoryFilter && row.categoryName !== categoryFilter) return false;
    if (!query) return true;
    return [row.name, row.sku, row.categoryName].join(' ').toLowerCase().includes(query);
  });
}

export function paginateFranchiseSalesCatalogRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
