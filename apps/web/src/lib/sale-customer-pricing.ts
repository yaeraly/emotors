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
