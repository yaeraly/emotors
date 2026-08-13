export const PRICING_POLICY_SCOPE = {
  HQ_CATALOG: 'HQ_CATALOG',
  BRANCH_PROFILE: 'BRANCH_PROFILE',
} as const;

export type PricingPolicyScope =
  (typeof PRICING_POLICY_SCOPE)[keyof typeof PRICING_POLICY_SCOPE];

/** HQ CEO pricing policy channels — distinct from Branch pricing profiles. */
export const HQ_PRICING_CHANNEL = {
  HQ_TRANSFER: 'HQ_TRANSFER',
  HQ_RETAIL: 'HQ_RETAIL',
  HQ_WHOLESALE: 'HQ_WHOLESALE',
} as const;

export type HqPricingChannel =
  (typeof HQ_PRICING_CHANNEL)[keyof typeof HQ_PRICING_CHANNEL];

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

/** Продажа филиалам — markup-only save; no wholesale-vs-retail cross-tier checks. */
export function validateHqTransferMarkupSave(hqBranchWholesaleMarkupPercent: number): string | null {
  if (hqBranchWholesaleMarkupPercent < 0) return 'Markup must be >= 0';
  return null;
}
