export type SalePricingChannel = 'RETAIL' | 'MASTER' | 'WHOLESALE';

export type BranchSaleCustomerType = 'RETAIL' | 'MASTER' | 'WHOLESALE';

export function resolvePricingChannelFromCustomerType(
  customerType?: BranchSaleCustomerType | string | null,
): SalePricingChannel {
  if (customerType === 'WHOLESALE') return 'WHOLESALE';
  if (customerType === 'MASTER') return 'MASTER';
  return 'RETAIL';
}

export function customerTypeLabelKey(customerType?: BranchSaleCustomerType | string | null) {
  if (customerType === 'WHOLESALE') return 'customers.customerTypeWholesale';
  if (customerType === 'MASTER') return 'customers.customerTypeMaster';
  return 'customers.customerTypeRetail';
}

export function isBranchListCustomerType(
  customerType?: string | null,
): customerType is BranchSaleCustomerType {
  return customerType === 'RETAIL' || customerType === 'MASTER' || customerType === 'WHOLESALE';
}

/** Human-readable Branch Clients list label; never returns raw enum values. */
export function formatBranchCustomerTypeDisplay(
  customerType: string | null | undefined,
  translate: (key: string) => string,
): string {
  if (!isBranchListCustomerType(customerType)) {
    return '—';
  }
  return translate(customerTypeLabelKey(customerType));
}

export function loyaltyCategoryLabelKey(category?: string | null) {
  switch (category) {
    case 'SILVER':
      return 'customers.loyaltyCategorySilver';
    case 'GOLD':
      return 'customers.loyaltyCategoryGold';
    case 'VIP':
      return 'customers.loyaltyCategoryVip';
    case 'STANDARD':
    default:
      return 'customers.loyaltyCategoryStandard';
  }
}

export function appliedPriceLabelKey(channel: SalePricingChannel) {
  if (channel === 'WHOLESALE') return 'sales.appliedPriceWholesale';
  if (channel === 'MASTER') return 'sales.appliedPriceMaster';
  return 'sales.appliedPriceRetail';
}

/** Preserve draft line quantity when refreshing prices for a new customer type. */
export function preserveSaleLineQuantity<T extends { quantity: string }>(
  existing: T,
  refreshed: T,
): T {
  return { ...refreshed, quantity: existing.quantity };
}

/** Display helper: HQ customer-type base + loyalty markup, floored at minimum. */
export function applyLoyaltyMarkupToRecommendedPrice(input: {
  basePriceKgs: number;
  loyaltyMarkupPercent?: number | null;
  minimumPriceKgs?: number | null;
  maximumPriceKgs?: number | null;
}): number {
  const base = Math.max(0, Number(input.basePriceKgs || 0));
  const markup = Math.max(0, Number(input.loyaltyMarkupPercent || 0));
  const minimum = Math.max(0, Number(input.minimumPriceKgs || 0));
  const maximum =
    input.maximumPriceKgs != null && Number(input.maximumPriceKgs) > 0
      ? Number(input.maximumPriceKgs)
      : null;
  const provisional = Math.round((base * (1 + markup / 100) + Number.EPSILON) * 100) / 100;
  let finalPrice = minimum > 0 && provisional < minimum ? minimum : provisional;
  if (maximum != null && finalPrice > maximum) {
    finalPrice = maximum;
  }
  return finalPrice;
}
