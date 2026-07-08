export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Google Sheets style: ROUNDUP(cost * markup% + cost, -1) → nearest 10 */
export function applyMarkupRoundUp(costPrice: number, markupPercent: number) {
  if (costPrice <= 0) return 0;
  const raw = costPrice * (markupPercent / 100) + costPrice;
  return Math.ceil(raw / 10) * 10;
}

export function applyMarkup(costPrice: number, markupPercent: number) {
  return applyMarkupRoundUp(costPrice, markupPercent);
}

export function pricesFromMarkups(
  costPriceKgs: number,
  markups: {
    wholesaleMarkupPercent: number;
    hqBranchWholesaleMarkupPercent: number;
    recommendedRetailMarkupPercent: number;
    minimumSellingMarkupPercent: number;
  },
) {
  return {
    wholesalePriceKgs: applyMarkupRoundUp(costPriceKgs, markups.wholesaleMarkupPercent),
    hqBranchWholesalePriceKgs: applyMarkupRoundUp(costPriceKgs, markups.hqBranchWholesaleMarkupPercent),
    recommendedRetailPriceKgs: applyMarkupRoundUp(costPriceKgs, markups.recommendedRetailMarkupPercent),
    minimumSellingPriceKgs: applyMarkupRoundUp(costPriceKgs, markups.minimumSellingMarkupPercent),
  };
}

export function validateProductMarkups(
  costPriceKgs: number,
  markups: {
    wholesaleMarkupPercent: number;
    hqBranchWholesaleMarkupPercent: number;
    recommendedRetailMarkupPercent: number;
    minimumSellingMarkupPercent: number;
  },
) {
  if (markups.wholesaleMarkupPercent < 0) return 'pricing.validationMarkupNegative';
  if (markups.hqBranchWholesaleMarkupPercent < 0) return 'pricing.validationMarkupNegative';
  if (markups.recommendedRetailMarkupPercent < 0) return 'pricing.validationMarkupNegative';
  if (markups.minimumSellingMarkupPercent < 0) return 'pricing.validationMarkupNegative';
  if (costPriceKgs <= 0) return 'pricing.validationCostRequired';

  const prices = pricesFromMarkups(costPriceKgs, markups);
  if (prices.wholesalePriceKgs <= 0) return 'pricing.validationWholesalePositive';
  if (prices.hqBranchWholesalePriceKgs <= 0) return 'pricing.validationHqWholesalePositive';
  if (prices.recommendedRetailPriceKgs <= 0) return 'pricing.validationRetailPositive';
  if (prices.minimumSellingPriceKgs <= 0) return 'pricing.validationMinimumPositive';
  if (prices.hqBranchWholesalePriceKgs > prices.wholesalePriceKgs + 0.01) {
    return 'pricing.validationHqWholesale';
  }
  if (prices.wholesalePriceKgs > prices.recommendedRetailPriceKgs + 0.01) {
    return 'pricing.validationWholesaleRetail';
  }
  if (prices.minimumSellingPriceKgs > prices.recommendedRetailPriceKgs + 0.01) {
    return 'pricing.validationMinimumRetail';
  }
  return null;
}
