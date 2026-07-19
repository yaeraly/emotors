export type SaleLinePriceState =
  | { level: 'ok'; kind: 'recommended' }
  | {
      level: 'warning';
      kind: 'below-recommended' | 'above-recommended';
      difference: number;
      boundary: number;
    }
  | {
      level: 'error';
      kind: 'below-minimum' | 'above-maximum';
      difference: number;
      boundary: number;
    };

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function evaluateSaleLinePrice(input: {
  unitPrice: number;
  minimumPrice: number;
  recommendedPrice: number;
  maximumPrice?: number | null;
  hasMaximumPrice?: boolean;
}): SaleLinePriceState {
  const unitPrice = roundMoney(input.unitPrice);
  const minimumPrice = roundMoney(input.minimumPrice);
  const recommendedPrice = roundMoney(input.recommendedPrice);
  const maximumPrice =
    input.hasMaximumPrice && input.maximumPrice != null && input.maximumPrice > 0
      ? roundMoney(input.maximumPrice)
      : null;

  if (minimumPrice > 0 && unitPrice + 0.01 < minimumPrice) {
    return {
      level: 'error',
      kind: 'below-minimum',
      difference: roundMoney(minimumPrice - unitPrice),
      boundary: minimumPrice,
    };
  }

  if (maximumPrice != null && unitPrice > maximumPrice + 0.01) {
    return {
      level: 'error',
      kind: 'above-maximum',
      difference: roundMoney(unitPrice - maximumPrice),
      boundary: maximumPrice,
    };
  }

  if (recommendedPrice > 0 && unitPrice + 0.01 < recommendedPrice) {
    return {
      level: 'warning',
      kind: 'below-recommended',
      difference: roundMoney(recommendedPrice - unitPrice),
      boundary: minimumPrice > 0 ? minimumPrice : recommendedPrice,
    };
  }

  if (recommendedPrice > 0 && unitPrice > recommendedPrice + 0.01) {
    return {
      level: 'warning',
      kind: 'above-recommended',
      difference: roundMoney(unitPrice - recommendedPrice),
      boundary: maximumPrice ?? recommendedPrice,
    };
  }

  return { level: 'ok', kind: 'recommended' };
}
