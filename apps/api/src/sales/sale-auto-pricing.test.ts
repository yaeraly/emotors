import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import { calculateFinalSaleUnitPrice, getLoyaltyDiscountPercent } from '../customers/customer-loyalty.util';
import {
  assertCustomerTypePriceOrder,
  resolvePricingChannelFromCustomerType,
} from './sale-customer-pricing.util';

describe('branch sale automatic pricing', () => {
  const discounts = {
    standardDiscountPercent: 0,
    silverDiscountPercent: 2,
    goldDiscountPercent: 4,
    vipDiscountPercent: 6,
  };

  it('selects retail/master/wholesale base prices by customer type', () => {
    assert.equal(resolvePricingChannelFromCustomerType(CustomerType.RETAIL), 'RETAIL');
    assert.equal(resolvePricingChannelFromCustomerType(CustomerType.MASTER), 'MASTER');
    assert.equal(resolvePricingChannelFromCustomerType(CustomerType.WHOLESALE), 'WHOLESALE');
  });

  it('keeps Retail > Master > Wholesale order', () => {
    assert.doesNotThrow(() =>
      assertCustomerTypePriceOrder({
        retailPriceKgs: 1200,
        masterPriceKgs: 1100,
        wholesalePriceKgs: 1000,
      }),
    );
  });

  it('applies configurable loyalty discount on backend final price', () => {
    const discount = getLoyaltyDiscountPercent(CustomerLoyaltyCategory.GOLD, discounts);
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1100,
      loyaltyDiscountPercent: discount,
      minimumPriceKgs: 900,
    });
    assert.equal(priced.finalPriceKgs, 1056);
  });

  it('never sells below minimum allowed price', () => {
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1000,
      loyaltyDiscountPercent: 10,
      minimumPriceKgs: 980,
    });
    assert.equal(priced.finalPriceKgs, 980);
    assert.equal(priced.minimumPriceApplied, true);
  });

  it('branch cannot keep a client override below calculated auto price floor', () => {
    const auto = calculateFinalSaleUnitPrice({
      basePriceKgs: 1200,
      loyaltyDiscountPercent: 0,
      minimumPriceKgs: 1000,
    });
    const attemptedOverride = 900;
    const charged = Math.max(attemptedOverride, auto.finalPriceKgs, 1000);
    assert.equal(auto.finalPriceKgs, 1200);
    assert.equal(charged, 1200);
  });
});
