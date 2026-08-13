import { MaximumPricePolicy, MaximumPricePolicySource } from '@prisma/client';

export type CategoryMaximumPolicyFields = {
  defaultRetailMaximumPolicy: MaximumPricePolicy;
  defaultWholesaleMaximumPolicy: MaximumPricePolicy;
  defaultRetailMaximumMarkupPercent: number | { toString(): string };
  defaultWholesaleMaximumMarkupPercent: number | { toString(): string };
};

export type ProductMaximumPolicyFields = {
  retailMaximumPolicySource: MaximumPricePolicySource;
  wholesaleMaximumPolicySource: MaximumPricePolicySource;
  retailMaximumPolicy: MaximumPricePolicy;
  wholesaleMaximumPolicy: MaximumPricePolicy;
  maximumRetailMarkupPercent: number | { toString(): string };
  maximumWholesaleMarkupPercent: number | { toString(): string };
};

export function resolveRetailMaximumPolicy(
  product: Pick<ProductMaximumPolicyFields, 'retailMaximumPolicySource' | 'retailMaximumPolicy'>,
  category: Pick<CategoryMaximumPolicyFields, 'defaultRetailMaximumPolicy'>,
): MaximumPricePolicy {
  if (product.retailMaximumPolicySource === MaximumPricePolicySource.CATEGORY) {
    return category.defaultRetailMaximumPolicy;
  }
  return product.retailMaximumPolicy;
}

export function resolveWholesaleMaximumPolicy(
  product: Pick<ProductMaximumPolicyFields, 'wholesaleMaximumPolicySource' | 'wholesaleMaximumPolicy'>,
  category: Pick<CategoryMaximumPolicyFields, 'defaultWholesaleMaximumPolicy'>,
): MaximumPricePolicy {
  if (product.wholesaleMaximumPolicySource === MaximumPricePolicySource.CATEGORY) {
    return category.defaultWholesaleMaximumPolicy;
  }
  return product.wholesaleMaximumPolicy;
}

export function resolveRetailMaximumMarkup(
  product: Pick<ProductMaximumPolicyFields, 'retailMaximumPolicySource' | 'maximumRetailMarkupPercent'>,
  category: Pick<CategoryMaximumPolicyFields, 'defaultRetailMaximumMarkupPercent'>,
): number {
  if (product.retailMaximumPolicySource === MaximumPricePolicySource.CATEGORY) {
    return Number(category.defaultRetailMaximumMarkupPercent ?? 0);
  }
  return Number(product.maximumRetailMarkupPercent ?? 0);
}

export function resolveWholesaleMaximumMarkup(
  product: Pick<ProductMaximumPolicyFields, 'wholesaleMaximumPolicySource' | 'maximumWholesaleMarkupPercent'>,
  category: Pick<CategoryMaximumPolicyFields, 'defaultWholesaleMaximumMarkupPercent'>,
): number {
  if (product.wholesaleMaximumPolicySource === MaximumPricePolicySource.CATEGORY) {
    return Number(category.defaultWholesaleMaximumMarkupPercent ?? 0);
  }
  return Number(product.maximumWholesaleMarkupPercent ?? 0);
}

export function isMaximumPolicyActive(policy: MaximumPricePolicy): boolean {
  return policy !== MaximumPricePolicy.DISABLED;
}

export function maximumPolicyToLegacyEnabled(policy: MaximumPricePolicy): boolean {
  return isMaximumPolicyActive(policy);
}
