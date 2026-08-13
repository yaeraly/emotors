import { MaximumPricePolicy, MaximumPricePolicySource } from '@prisma/client';
import {
  isMaximumPolicyActive,
  resolveRetailMaximumMarkup,
  resolveRetailMaximumPolicy,
  resolveWholesaleMaximumMarkup,
  resolveWholesaleMaximumPolicy,
} from './pricing-policy-resolution.util';

describe('pricing-policy-resolution.util', () => {
  const category = {
    defaultRetailMaximumPolicy: MaximumPricePolicy.HARD_LIMIT,
    defaultWholesaleMaximumPolicy: MaximumPricePolicy.WARNING_ONLY,
    defaultRetailMaximumMarkupPercent: 40,
    defaultWholesaleMaximumMarkupPercent: 25,
  };

  it('inherits retail policy from category when source is CATEGORY', () => {
    expect(
      resolveRetailMaximumPolicy(
        {
          retailMaximumPolicySource: MaximumPricePolicySource.CATEGORY,
          retailMaximumPolicy: MaximumPricePolicy.DISABLED,
        },
        category,
      ),
    ).toBe(MaximumPricePolicy.HARD_LIMIT);
  });

  it('uses product retail policy when source is PRODUCT', () => {
    expect(
      resolveRetailMaximumPolicy(
        {
          retailMaximumPolicySource: MaximumPricePolicySource.PRODUCT,
          retailMaximumPolicy: MaximumPricePolicy.WARNING_ONLY,
        },
        category,
      ),
    ).toBe(MaximumPricePolicy.WARNING_ONLY);
  });

  it('inherits wholesale policy and markup from category', () => {
    expect(
      resolveWholesaleMaximumPolicy(
        {
          wholesaleMaximumPolicySource: MaximumPricePolicySource.CATEGORY,
          wholesaleMaximumPolicy: MaximumPricePolicy.DISABLED,
        },
        category,
      ),
    ).toBe(MaximumPricePolicy.WARNING_ONLY);
    expect(
      resolveWholesaleMaximumMarkup(
        {
          wholesaleMaximumPolicySource: MaximumPricePolicySource.CATEGORY,
          maximumWholesaleMarkupPercent: 10,
        },
        category,
      ),
    ).toBe(25);
  });

  it('uses product wholesale markup when source is PRODUCT', () => {
    expect(
      resolveWholesaleMaximumMarkup(
        {
          wholesaleMaximumPolicySource: MaximumPricePolicySource.PRODUCT,
          maximumWholesaleMarkupPercent: 18,
        },
        category,
      ),
    ).toBe(18);
  });

  it('treats only DISABLED as inactive maximum policy', () => {
    expect(isMaximumPolicyActive(MaximumPricePolicy.DISABLED)).toBe(false);
    expect(isMaximumPolicyActive(MaximumPricePolicy.WARNING_ONLY)).toBe(true);
    expect(isMaximumPolicyActive(MaximumPricePolicy.HARD_LIMIT)).toBe(true);
  });
});
