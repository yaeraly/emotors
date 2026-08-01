import { CustomerType, PricingEnginePriceType } from '@prisma/client';

export type SalePricingChannel = 'RETAIL' | 'MASTER' | 'WHOLESALE';

export function resolvePricingChannelFromCustomerType(
  customerType: CustomerType,
): SalePricingChannel {
  if (customerType === CustomerType.WHOLESALE) return 'WHOLESALE';
  if (customerType === CustomerType.MASTER) return 'MASTER';
  return 'RETAIL';
}

export function recommendedPriceTypeForChannel(
  channel: SalePricingChannel,
): PricingEnginePriceType {
  if (channel === 'WHOLESALE') return PricingEnginePriceType.WHOLESALE_RECOMMENDED;
  if (channel === 'MASTER') return PricingEnginePriceType.MASTER_RECOMMENDED;
  return PricingEnginePriceType.RETAIL_RECOMMENDED;
}

export function minimumPriceTypeForChannel(
  channel: SalePricingChannel,
): PricingEnginePriceType {
  if (channel === 'WHOLESALE') return PricingEnginePriceType.WHOLESALE_MINIMUM;
  if (channel === 'MASTER') return PricingEnginePriceType.MASTER_MINIMUM;
  return PricingEnginePriceType.RETAIL_MINIMUM;
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
  if (channel === 'WHOLESALE') {
    return 'Для товара не настроена единая оптовая цена.';
  }
  if (channel === 'MASTER') {
    return 'Для товара не настроена единая Master-цена.';
  }
  return 'Для товара не настроена единая розничная цена.';
}

export function isBranchRetailWholesaleCustomerType(customerType: CustomerType) {
  return (
    customerType === CustomerType.RETAIL ||
    customerType === CustomerType.MASTER ||
    customerType === CustomerType.WHOLESALE
  );
}

/** Required selling price order from HQ policy: Retail > Master > Wholesale. */
export function assertCustomerTypePriceOrder(input: {
  retailPriceKgs: number;
  masterPriceKgs: number;
  wholesalePriceKgs: number;
}) {
  const retail = Number(input.retailPriceKgs || 0);
  const master = Number(input.masterPriceKgs || 0);
  const wholesale = Number(input.wholesalePriceKgs || 0);
  if (retail <= 0 || master <= 0 || wholesale <= 0) return;
  if (!(retail > master && master > wholesale)) {
    throw new Error('Price order must be Retail > Master > Wholesale');
  }
}
