export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Google Sheets style: ROUNDUP(cost * markup% + cost, -1) → nearest 10 */
export function applyMarkupRoundUp(costPrice: number, markupPercent: number) {
  if (costPrice <= 0) return 0;
  const raw = costPrice * (markupPercent / 100) + costPrice;
  return Math.ceil(raw / 10) * 10;
}

/** HQ wholesale: when markup is 0, return exact cost without ROUNDUP. */
export function applyHqBranchWholesaleMarkup(costPrice: number, markupPercent: number) {
  if (costPrice <= 0) return 0;
  if (markupPercent === 0) return roundMoney(costPrice);
  return applyMarkupRoundUp(costPrice, markupPercent);
}

export function applyMarkup(costPrice: number, markupPercent: number) {
  return applyMarkupRoundUp(costPrice, markupPercent);
}

export function deriveMarkupPercent(costPrice: number, sellingPrice: number) {
  if (costPrice <= 0) return 0;
  return roundMoney(((sellingPrice - costPrice) / costPrice) * 100);
}

export function resolveHqToBranchPrice(
  costPriceKgs: number,
  branchType: 'HQ_BRANCH' | 'FRANCHISE_BRANCH',
  markupPercent: number,
) {
  if (branchType === 'HQ_BRANCH') return roundMoney(costPriceKgs);
  return applyHqBranchWholesaleMarkup(costPriceKgs, markupPercent);
}

export function resolveBranchHqMarkupPercent(input: {
  branchType: 'HQ_BRANCH' | 'FRANCHISE_BRANCH';
  productDefaultMarkupPercent: number;
  profileMarkupPercent?: number | null;
  profileStatus?: 'ACTIVE' | 'INACTIVE' | null;
}) {
  if (input.branchType === 'HQ_BRANCH') return 0;
  if (input.profileStatus === 'ACTIVE' && input.profileMarkupPercent != null) {
    return Math.max(0, input.profileMarkupPercent);
  }
  return Math.max(0, input.productDefaultMarkupPercent);
}

export function resolveBranchPurchasePrice(
  costPriceKgs: number,
  branchType: 'HQ_BRANCH' | 'FRANCHISE_BRANCH',
  markupPercent: number,
) {
  return resolveHqToBranchPrice(costPriceKgs, branchType, markupPercent);
}

export type BranchProductPriceSource = 'OVERRIDE' | 'PROFILE' | 'PRODUCT_DEFAULT' | 'HQ_COST';

export function isProductOverrideEffective(
  override: { status: string; startDate: Date; endDate: Date },
  now: Date = new Date(),
) {
  if (override.status !== 'ACTIVE') return false;
  return override.startDate.getTime() <= now.getTime() && now.getTime() <= override.endDate.getTime();
}

export function dateRangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA.getTime() <= endB.getTime() && startB.getTime() <= endA.getTime();
}

export function resolveFinalBranchProductPrice(input: {
  costPriceKgs: number;
  branchType: 'HQ_BRANCH' | 'FRANCHISE_BRANCH';
  productDefaultMarkupPercent: number;
  profileMarkupPercent?: number | null;
  profileStatus?: 'ACTIVE' | 'INACTIVE' | null;
  overridePriceKgs?: number | null;
  override?: { status: string; startDate: Date; endDate: Date } | null;
  now?: Date;
}): { priceKgs: number; source: BranchProductPriceSource } {
  const override = input.override;
  if (
    override &&
    isProductOverrideEffective(override, input.now) &&
    input.overridePriceKgs != null &&
    input.overridePriceKgs >= 0
  ) {
    return { priceKgs: roundMoney(input.overridePriceKgs), source: 'OVERRIDE' };
  }

  if (input.branchType === 'HQ_BRANCH') {
    return { priceKgs: roundMoney(input.costPriceKgs), source: 'HQ_COST' };
  }

  const markupPercent = resolveBranchHqMarkupPercent({
    branchType: input.branchType,
    productDefaultMarkupPercent: input.productDefaultMarkupPercent,
    profileMarkupPercent: input.profileMarkupPercent,
    profileStatus: input.profileStatus,
  });
  const priceKgs = resolveBranchPurchasePrice(input.costPriceKgs, input.branchType, markupPercent);
  const source: BranchProductPriceSource =
    input.profileStatus === 'ACTIVE' && input.profileMarkupPercent != null
      ? 'PROFILE'
      : 'PRODUCT_DEFAULT';
  return { priceKgs, source };
}

export function pricesFromMarkups(
  costPriceKgs: number,
  markups: {
    wholesaleMarkupPercent: number;
    minimumWholesaleMarkupPercent?: number;
    hqBranchWholesaleMarkupPercent: number;
    recommendedRetailMarkupPercent: number;
    minimumSellingMarkupPercent: number;
  },
) {
  const branchPurchasePriceKgs = applyHqBranchWholesaleMarkup(
    costPriceKgs,
    markups.hqBranchWholesaleMarkupPercent,
  );
  const minimumWholesaleMarkupPercent = markups.minimumWholesaleMarkupPercent ?? markups.wholesaleMarkupPercent;
  return {
    hqBranchWholesalePriceKgs: branchPurchasePriceKgs,
    minimumWholesalePriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, minimumWholesaleMarkupPercent),
    wholesalePriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, markups.wholesaleMarkupPercent),
    recommendedRetailPriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, markups.recommendedRetailMarkupPercent),
    minimumSellingPriceKgs: applyMarkupRoundUp(branchPurchasePriceKgs, markups.minimumSellingMarkupPercent),
  };
}

export function validateRetailCurrentPrice(
  branchPurchasePriceKgs: number,
  minimumMarkupPercent: number,
  recommendedMarkupPercent: number,
  currentPriceKgs: number,
) {
  if (branchPurchasePriceKgs <= 0) return 'Cost price must be greater than 0 to validate retail price';
  const minPrice = applyMarkupRoundUp(branchPurchasePriceKgs, minimumMarkupPercent);
  const maxPrice = applyMarkupRoundUp(branchPurchasePriceKgs, recommendedMarkupPercent);
  if (currentPriceKgs + 0.01 < minPrice) {
    return 'Current retail price cannot be below minimum allowed price';
  }
  if (currentPriceKgs > maxPrice + 0.01) {
    return 'Current retail price cannot exceed recommended retail price';
  }
  return null;
}

export function validateWholesaleCurrentPrice(
  branchPurchasePriceKgs: number,
  minimumMarkupPercent: number,
  recommendedMarkupPercent: number,
  currentPriceKgs: number,
) {
  if (branchPurchasePriceKgs <= 0) return 'Cost price must be greater than 0 to validate wholesale price';
  const minPrice = applyMarkupRoundUp(branchPurchasePriceKgs, minimumMarkupPercent);
  const maxPrice = applyMarkupRoundUp(branchPurchasePriceKgs, recommendedMarkupPercent);
  if (currentPriceKgs + 0.01 < minPrice) {
    return 'Current wholesale price cannot be below minimum allowed price';
  }
  if (currentPriceKgs > maxPrice + 0.01) {
    return 'Current wholesale price cannot exceed recommended wholesale price';
  }
  return null;
}

export function validateMarkupInput(markups: {
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
}) {
  if (markups.wholesaleMarkupPercent < 0) return 'Wholesale markup must be >= 0';
  if (markups.hqBranchWholesaleMarkupPercent < 0) return 'HQ wholesale markup must be >= 0';
  if (markups.recommendedRetailMarkupPercent < 0) return 'Retail markup must be >= 0';
  if (markups.minimumSellingMarkupPercent < 0) return 'Minimum markup must be >= 0';
  return null;
}

export function validatePricingTiers(input: {
  branchPurchasePriceKgs: number;
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
}) {
  if (input.branchPurchasePriceKgs <= 0) return 'Branch purchase price must be greater than 0';
  if (input.wholesalePriceKgs <= 0) return 'Wholesale price must be greater than 0';
  if (input.hqBranchWholesalePriceKgs <= 0) return 'HQ wholesale price must be greater than 0';
  if (input.recommendedRetailPriceKgs <= 0) return 'Retail price must be greater than 0';
  if (input.minimumSellingPriceKgs <= 0) return 'Minimum price must be greater than 0';
  if (input.minimumSellingPriceKgs > input.recommendedRetailPriceKgs + 0.01) {
    return 'Minimum selling price cannot exceed recommended retail price';
  }
  if (input.wholesalePriceKgs > input.recommendedRetailPriceKgs + 0.01) {
    return 'Wholesale price cannot exceed recommended retail price';
  }
  if (input.hqBranchWholesalePriceKgs > input.wholesalePriceKgs + 0.01) {
    return 'Branch purchase price cannot exceed wholesale price';
  }
  return null;
}

export function validateMarkups(costPriceKgs: number, markups: {
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
}) {
  const markupError = validateMarkupInput(markups);
  if (markupError) return markupError;
  if (costPriceKgs <= 0) return 'Cost price must be greater than 0 to calculate prices';
  const prices = pricesFromMarkups(costPriceKgs, markups);
  return validatePricingTiers({
    branchPurchasePriceKgs: prices.hqBranchWholesalePriceKgs,
    ...prices,
  });
}
