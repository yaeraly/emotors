export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyMarkup(costPrice: number, markupPercent: number) {
  if (costPrice <= 0) return 0;
  return roundMoney(costPrice * (1 + markupPercent / 100));
}

export function deriveMarkupPercent(costPrice: number, sellingPrice: number) {
  if (costPrice <= 0) return 0;
  return roundMoney(((sellingPrice - costPrice) / costPrice) * 100);
}

export function validateProductPrices(input: {
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
}) {
  if (input.wholesalePriceKgs <= 0) return 'pricing.validationWholesalePositive';
  if (input.hqBranchWholesalePriceKgs <= 0) return 'pricing.validationHqWholesalePositive';
  if (input.recommendedRetailPriceKgs <= 0) return 'pricing.validationRetailPositive';
  if (input.minimumSellingPriceKgs <= 0) return 'pricing.validationMinimumPositive';
  if (input.hqBranchWholesalePriceKgs > input.wholesalePriceKgs + 0.01) {
    return 'pricing.validationHqWholesale';
  }
  if (input.wholesalePriceKgs > input.recommendedRetailPriceKgs + 0.01) {
    return 'pricing.validationWholesaleRetail';
  }
  if (input.minimumSellingPriceKgs > input.recommendedRetailPriceKgs + 0.01) {
    return 'pricing.validationMinimumRetail';
  }
  return null;
}
