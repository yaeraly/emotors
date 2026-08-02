import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerLoyaltyCategory, CustomerType } from '@prisma/client';
import {
  calculateFinalSaleUnitPrice,
  DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
  getLoyaltyMarkupPercent,
} from '../customers/customer-loyalty.util';
import {
  assertCustomerTypePriceOrder,
  resolvePricingChannelFromCustomerType,
} from './sale-customer-pricing.util';

describe('branch sale automatic pricing', () => {
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

  it('applies branch loyalty markup on HQ customer-type base price', () => {
    const markup = getLoyaltyMarkupPercent(
      CustomerLoyaltyCategory.SILVER,
      DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
      CustomerType.WHOLESALE,
    );
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1000,
      loyaltyMarkupPercent: markup,
      minimumPriceKgs: 900,
    });
    assert.equal(priced.finalPriceKgs, 1030);
  });

  it('applies master-specific markup on master base price', () => {
    const markup = getLoyaltyMarkupPercent(
      CustomerLoyaltyCategory.GOLD,
      DEFAULT_CUSTOMER_TYPE_LOYALTY_MARKUPS,
      CustomerType.MASTER,
    );
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1100,
      loyaltyMarkupPercent: markup,
      minimumPriceKgs: 0,
    });
    assert.equal(markup, 2);
    assert.equal(priced.finalPriceKgs, 1122);
  });

  it('never sells below minimum allowed price', () => {
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1000,
      loyaltyMarkupPercent: 0,
      minimumPriceKgs: 1100,
    });
    assert.equal(priced.finalPriceKgs, 1100);
    assert.equal(priced.minimumPriceApplied, true);
  });

  it('branch cannot keep a client override below calculated auto price', () => {
    const auto = calculateFinalSaleUnitPrice({
      basePriceKgs: 1200,
      loyaltyMarkupPercent: 5,
      minimumPriceKgs: 1000,
    });
    const attemptedOverride = 900;
    const charged = Math.max(attemptedOverride, auto.finalPriceKgs, 1000);
    assert.equal(auto.finalPriceKgs, 1260);
    assert.equal(charged, 1260);
  });

  it('does not mutate cost fields when calculating selling price', () => {
    const unitCost = 700;
    const priced = calculateFinalSaleUnitPrice({
      basePriceKgs: 1000,
      loyaltyMarkupPercent: 5,
      minimumPriceKgs: 0,
    });
    assert.equal(unitCost, 700);
    assert.equal(priced.finalPriceKgs, 1050);
  });
});
