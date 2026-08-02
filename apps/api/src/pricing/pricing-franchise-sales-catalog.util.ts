import { PricingAppliedRuleType, WarehouseType } from '@prisma/client';
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

export type FranchiseSalesConfigurationStatus = 'CONFIGURED' | 'NOT_CONFIGURED';

export type FranchiseSalesCatalogListResponse = {
  items: ReturnType<typeof buildFranchiseSalesCatalogRow>[];
  total: number;
  activePricingPolicyVersionId: string | null;
  activePricingPolicyVersionNumber: number | null;
  warning: string | null;
};

export const FRANCHISE_SALES_ACTIVE_VERSION_WARNING =
  'Активная версия ценовой политики не настроена. Товары показаны без рассчитанных цен.';

const RULE_BASED_PRICE_TYPES = new Set<PricingAppliedRuleType>([
  PricingAppliedRuleType.TEMP_OVERRIDE,
  PricingAppliedRuleType.PRODUCT_RULE,
  PricingAppliedRuleType.CATEGORY_RULE,
  PricingAppliedRuleType.PRICING_PROFILE,
]);

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

function isRuleBasedConfiguredPrice(
  appliedRuleType: PricingAppliedRuleType | null | undefined,
): boolean {
  return Boolean(appliedRuleType && RULE_BASED_PRICE_TYPES.has(appliedRuleType));
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
  const ruleBasedPrice = isRuleBasedConfiguredPrice(engine?.appliedRuleType);

  const baseFranchiseMarkupPercent =
    storedMarkupPercent > 0
      ? storedMarkupPercent
      : engineMarkupPercent > 0
        ? engineMarkupPercent
        : 0;
  const hqMarkupPercent = baseFranchiseMarkupPercent;
  const markupConfigured = baseFranchiseMarkupPercent > 0 || ruleBasedPrice;

  // Never treat ROUNDUP(cost) from a 0% BASE_FRANCHISE / HQ_COST resolution as a configured branch price.
  let finalBranchPriceKgs: number | null = null;
  if (markupConfigured) {
    if (engine && engine.resolvedPriceKgs > 0) {
      finalBranchPriceKgs = engine.resolvedPriceKgs;
    } else if (storedBranchPriceKgs > 0) {
      finalBranchPriceKgs = storedBranchPriceKgs;
    } else if (costPriceKgs && baseFranchiseMarkupPercent > 0) {
      finalBranchPriceKgs = applyHqBranchWholesaleMarkup(costPriceKgs, baseFranchiseMarkupPercent);
    }
  }

  const branchPriceKgs = finalBranchPriceKgs;
  const baseFranchisePriceKgs =
    markupConfigured && engine && engine.baseBranchPriceKgs > 0
      ? engine.baseBranchPriceKgs
      : markupConfigured && storedBranchPriceKgs > 0
        ? storedBranchPriceKgs
        : branchPriceKgs;

  const priceConfigured = Boolean(
    branchPriceKgs != null &&
      branchPriceKgs > 0 &&
      markupConfigured,
  );
  const configurationStatus: FranchiseSalesConfigurationStatus = priceConfigured
    ? 'CONFIGURED'
    : 'NOT_CONFIGURED';

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
    markupConfigured,
    configurationStatus,
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

export function buildFranchiseSalesCatalogListResponse(input: {
  items: ReturnType<typeof buildFranchiseSalesCatalogRow>[];
  activePricingPolicyVersionId?: string | null;
  activePricingPolicyVersionNumber?: number | null;
}): FranchiseSalesCatalogListResponse {
  const activePricingPolicyVersionId = input.activePricingPolicyVersionId ?? null;
  return {
    items: input.items,
    total: input.items.length,
    activePricingPolicyVersionId,
    activePricingPolicyVersionNumber: input.activePricingPolicyVersionNumber ?? null,
    warning: activePricingPolicyVersionId ? null : FRANCHISE_SALES_ACTIVE_VERSION_WARNING,
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

/** Prisma where for sellable HQ Product Catalog rows used by franchise-sales. */
export function buildFranchiseSalesCatalogProductWhere(hqBranchId: string) {
  return {
    deletedAt: null,
    isActive: true,
    OR: [
      { branchId: hqBranchId },
      {
        warehouse: {
          warehouseType: WarehouseType.HQ,
          branchId: null,
          deletedAt: null,
          isActive: true,
        },
      },
    ],
  };
}
