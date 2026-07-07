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

export function validatePricingTiers(input: {
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
}) {
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
