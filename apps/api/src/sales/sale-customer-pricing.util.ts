import { CustomerType } from '@prisma/client';

export type SalePricingChannel = 'RETAIL' | 'WHOLESALE';

export function resolvePricingChannelFromCustomerType(
  customerType: CustomerType,
): SalePricingChannel {
  return customerType === CustomerType.WHOLESALE ? 'WHOLESALE' : 'RETAIL';
}

export function assertBranchSaleCustomerTypeAllowed(customerType: CustomerType) {
  if (
    customerType === CustomerType.DEALER ||
    customerType === CustomerType.DISTRIBUTOR
  ) {
    throw new Error('Dealer and Distributor customers must be served through HQ Sales');
  }
}

export function assertSalePricingChannelMatchesCustomer(
  customerType: CustomerType,
  pricingChannel: SalePricingChannel | undefined,
) {
  const expected = resolvePricingChannelFromCustomerType(customerType);
  if (pricingChannel && pricingChannel !== expected) {
    throw new Error('Sale pricing channel does not match customer type');
  }
}

export function missingSalePricingPolicyMessage(channel: SalePricingChannel) {
  return channel === 'WHOLESALE'
    ? 'Для товара не настроена оптовая ценовая политика.'
    : 'Для товара не настроена розничная ценовая политика.';
}

export function isBranchRetailWholesaleCustomerType(customerType: CustomerType) {
  return (
    customerType === CustomerType.RETAIL || customerType === CustomerType.WHOLESALE
  );
}
