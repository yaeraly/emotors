export type SalePricingChannel = 'RETAIL' | 'WHOLESALE';

export type BranchSaleCustomerType = 'RETAIL' | 'WHOLESALE';

export function resolvePricingChannelFromCustomerType(
  customerType?: BranchSaleCustomerType | string | null,
): SalePricingChannel {
  return customerType === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
}

export function customerTypeLabelKey(customerType?: BranchSaleCustomerType | string | null) {
  return customerType === 'WHOLESALE'
    ? 'customers.customerTypeWholesale'
    : 'customers.customerTypeRetail';
}

export function appliedPriceLabelKey(channel: SalePricingChannel) {
  return channel === 'WHOLESALE' ? 'sales.appliedPriceWholesale' : 'sales.appliedPriceRetail';
}

/** Preserve draft line quantity when refreshing prices for a new customer type. */
export function preserveSaleLineQuantity<T extends { quantity: string }>(
  existing: T,
  refreshed: T,
): T {
  return { ...refreshed, quantity: existing.quantity };
}
