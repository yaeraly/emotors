import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import { calculateFinalSaleUnitPrice, getLoyaltyMarkupPercent } from '../customers/customer-loyalty.util';
import type { BranchPricingPolicyService } from '../customers/branch-pricing-policy.service';
import type { PricingResolutionService } from '../pricing/pricing-resolution.service';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  maximumPriceTypeForChannel,
  minimumPriceTypeForChannel,
  recommendedPriceTypeForChannel,
  resolvePricingChannelFromCustomerType,
  type SalePricingChannel,
} from '../sales/sale-customer-pricing.util';
import { validateSalePriceRange } from '../sales/sale-price-range.util';

type PricingDeps = {
  pricingResolution: PricingResolutionService;
  branchPricingPolicyService: BranchPricingPolicyService;
};

type CustomerPricingContext = {
  id: string;
  branchId: string;
  customerType: CustomerType;
  loyaltyCategory?: CustomerLoyaltyCategory | null;
};

export async function resolveServiceProductUnitPrice(
  deps: PricingDeps,
  customer: CustomerPricingContext,
  productId: string,
  requestedUnitPrice?: number | null,
) {
  const channel = resolvePricingChannelFromCustomerType(customer.customerType);
  const branchPolicy = await deps.branchPricingPolicyService.getEffectivePolicy(customer.branchId);
  const loyaltyCategory = customer.loyaltyCategory ?? CustomerLoyaltyCategory.STANDARD;
  const loyaltyMarkupPercent = getLoyaltyMarkupPercent(
    loyaltyCategory,
    branchPolicy,
    customer.customerType,
  );

  const basePrice = await resolveChannelPrice(deps, customer.branchId, productId, channel, 'recommended');
  if (basePrice == null || basePrice <= 0) {
    throw new Error('Product price is not configured');
  }

  const minimumPrice =
    (await resolveChannelPrice(deps, customer.branchId, productId, channel, 'minimum')) ?? 0;
  const maximumPrice = await resolveChannelPrice(
    deps,
    customer.branchId,
    productId,
    channel,
    'maximum',
  );

  const priced = calculateFinalSaleUnitPrice({
    basePriceKgs: basePrice,
    loyaltyMarkupPercent,
    minimumPriceKgs: minimumPrice,
  });
  let recommendedPrice = priced.finalPriceKgs;
  if (maximumPrice != null && recommendedPrice > maximumPrice + 0.01) {
    recommendedPrice = maximumPrice;
  }

  if (requestedUnitPrice == null || requestedUnitPrice === undefined) {
    return {
      unitPrice: recommendedPrice,
      freeze: await deps.pricingResolution.resolveWithFreeze(customer.branchId, productId, {
        priceType: recommendedPriceTypeForChannel(channel),
      }),
    };
  }

  const range = validateSalePriceRange({
    requestedSalePrice: requestedUnitPrice,
    authoritativeMinimumPrice: minimumPrice,
    authoritativeMaximumPrice: maximumPrice,
    allowZeroPrice: false,
  });
  if (!range.ok) {
    throw new Error(range.message);
  }

  return {
    unitPrice: range.salePrice,
    freeze: await deps.pricingResolution.resolveWithFreeze(customer.branchId, productId, {
      priceType: recommendedPriceTypeForChannel(channel),
    }),
  };
}

async function resolveChannelPrice(
  deps: PricingDeps,
  branchId: string,
  productId: string,
  channel: SalePricingChannel,
  kind: 'recommended' | 'minimum' | 'maximum',
) {
  const priceType =
    kind === 'recommended'
      ? recommendedPriceTypeForChannel(channel)
      : kind === 'minimum'
        ? minimumPriceTypeForChannel(channel)
        : maximumPriceTypeForChannel(channel);

  try {
    const freeze = await deps.pricingResolution.resolveWithFreeze(branchId, productId, { priceType });
    const price = roundDisplayMoney(Number(freeze.resolvedPriceKgs ?? 0));
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}
