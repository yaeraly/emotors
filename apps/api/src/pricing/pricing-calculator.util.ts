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
  const minimumWholesaleMarkupPercent = markups.minimumWholesaleMarkupPercent ?? markups.wholesaleMarkupPercent;
  return {
    minimumWholesalePriceKgs: applyMarkupRoundUp(costPriceKgs, minimumWholesaleMarkupPercent),
    wholesalePriceKgs: applyMarkupRoundUp(costPriceKgs, markups.wholesaleMarkupPercent),
    hqBranchWholesalePriceKgs: applyHqBranchWholesaleMarkup(costPriceKgs, markups.hqBranchWholesaleMarkupPercent),
    recommendedRetailPriceKgs: applyMarkupRoundUp(costPriceKgs, markups.recommendedRetailMarkupPercent),
    minimumSellingPriceKgs: applyMarkupRoundUp(costPriceKgs, markups.minimumSellingMarkupPercent),
  };
}

export function validateRetailCurrentPrice(
  costPriceKgs: number,
  minimumMarkupPercent: number,
  recommendedMarkupPercent: number,
  currentPriceKgs: number,
) {
  if (costPriceKgs <= 0) return 'Cost price must be greater than 0 to validate retail price';
  const minPrice = applyMarkupRoundUp(costPriceKgs, minimumMarkupPercent);
  const maxPrice = applyMarkupRoundUp(costPriceKgs, recommendedMarkupPercent);
  if (currentPriceKgs + 0.01 < minPrice) {
    return 'Current retail price cannot be below minimum allowed price';
  }
  if (currentPriceKgs > maxPrice + 0.01) {
    return 'Current retail price cannot exceed recommended retail price';
  }
  return null;
}

export function validateWholesaleCurrentPrice(
  costPriceKgs: number,
  minimumMarkupPercent: number,
  recommendedMarkupPercent: number,
  currentPriceKgs: number,
) {
  if (costPriceKgs <= 0) return 'Cost price must be greater than 0 to validate wholesale price';
  const minPrice = applyMarkupRoundUp(costPriceKgs, minimumMarkupPercent);
  const maxPrice = applyMarkupRoundUp(costPriceKgs, recommendedMarkupPercent);
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
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
}) {
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
    return 'HQ branch wholesale price cannot exceed wholesale price';
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
  return validatePricingTiers(pricesFromMarkups(costPriceKgs, markups));
}
