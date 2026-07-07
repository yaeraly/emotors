export const DISCOUNT_EXCEEDS_ALLOWED_LIMIT = 'DISCOUNT_EXCEEDS_ALLOWED_LIMIT';
export const PRICE_BELOW_MINIMUM = 'PRICE_BELOW_MINIMUM';
export const PRICE_CHANGE_DENIED = 'PRICE_CHANGE_DENIED';

export const PRICING_POLICY_FIELDS = [
  'wholesalePriceKgs',
  'hqBranchWholesalePriceKgs',
  'recommendedRetailPriceKgs',
  'minimumSellingPriceKgs',
  'maximumDiscountPercent',
] as const;

export type PricingPolicyField = (typeof PRICING_POLICY_FIELDS)[number];
