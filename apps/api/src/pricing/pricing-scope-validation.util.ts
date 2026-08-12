export const PRICING_POLICY_SCOPE = {
  HQ_CATALOG: 'HQ_CATALOG',
  BRANCH_PROFILE: 'BRANCH_PROFILE',
} as const;

export type PricingPolicyScope =
  (typeof PRICING_POLICY_SCOPE)[keyof typeof PRICING_POLICY_SCOPE];

/**
 * Cross-channel price ordering for unified HQ catalog customer-type prices.
 * Used by sales/checkout validation — not when saving isolated HQ retail markups.
 */
export function assertHqCatalogCustomerTypePriceOrder(input: {
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
