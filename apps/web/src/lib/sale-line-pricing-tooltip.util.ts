export type SaleLinePricingTooltipLabels = {
  title: string;
  minimum: string;
  recommended: string;
  maximum: string;
  notConfigured: string;
  valueNotConfigured: string;
};

export type SaleLinePricingTooltipInput = {
  minimumPrice: number;
  recommendedPrice: number;
  maximumPrice: number | null;
  hasMaximumPrice: boolean;
  hasPricingPolicy: boolean;
  formatMoney: (value: number) => string;
  labels: SaleLinePricingTooltipLabels;
};

export function isSaleLinePricingRangeUnavailable(input: {
  hasPricingPolicy: boolean;
  minimumPrice: number;
  recommendedPrice: number;
}) {
  return !input.hasPricingPolicy || input.minimumPrice <= 0 || input.recommendedPrice <= 0;
}

export function buildSaleLinePricingTooltipContent(input: SaleLinePricingTooltipInput) {
  if (isSaleLinePricingRangeUnavailable(input)) {
    return {
      configured: false,
      title: input.labels.title,
      lines: [input.labels.notConfigured] as string[],
    };
  }

  const maximumValue =
    input.hasMaximumPrice && input.maximumPrice != null && input.maximumPrice > 0
      ? input.formatMoney(input.maximumPrice)
      : input.labels.valueNotConfigured;

  return {
    configured: true,
    title: input.labels.title,
    lines: [
      `${input.labels.minimum}: ${input.formatMoney(input.minimumPrice)}`,
      `${input.labels.recommended}: ${input.formatMoney(input.recommendedPrice)}`,
      `${input.labels.maximum}: ${maximumValue}`,
    ],
  };
}
