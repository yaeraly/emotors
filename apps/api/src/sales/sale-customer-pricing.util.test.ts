import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerType, PricingEnginePriceType } from '@prisma/client';
import {
  assertCustomerTypePriceOrder,
  assertSalePricingChannelMatchesCustomer,
  isBranchRetailWholesaleCustomerType,
  recommendedPriceTypeForChannel,
  resolvePricingChannelFromCustomerType,
} from './sale-customer-pricing.util';

describe('sale customer pricing channels', () => {
  it('defaults non-wholesale/non-master types to RETAIL channel', () => {
    assert.equal(resolvePricingChannelFromCustomerType(CustomerType.RETAIL), 'RETAIL');
    assert.equal(resolvePricingChannelFromCustomerType(CustomerType.FRANCHISE), 'RETAIL');
  });

  it('maps Master customers to Master price channel', () => {
    assert.equal(resolvePricingChannelFromCustomerType(CustomerType.MASTER), 'MASTER');
    assert.equal(
      recommendedPriceTypeForChannel('MASTER'),
      PricingEnginePriceType.MASTER_RECOMMENDED,
    );
  });

  it('maps Wholesale customers to Wholesale price channel', () => {
    assert.equal(resolvePricingChannelFromCustomerType(CustomerType.WHOLESALE), 'WHOLESALE');
    assert.equal(
      recommendedPriceTypeForChannel('WHOLESALE'),
      PricingEnginePriceType.WHOLESALE_RECOMMENDED,
    );
  });

  it('enforces Retail > Master > Wholesale price order', () => {
    assert.doesNotThrow(() =>
      assertCustomerTypePriceOrder({
        retailPriceKgs: 1200,
        masterPriceKgs: 1100,
        wholesalePriceKgs: 1000,
      }),
    );
    assert.throws(() =>
      assertCustomerTypePriceOrder({
        retailPriceKgs: 1000,
        masterPriceKgs: 1100,
        wholesalePriceKgs: 1200,
      }),
    );
  });

  it('treats Retail/Master/Wholesale as branch customer types', () => {
    assert.equal(isBranchRetailWholesaleCustomerType(CustomerType.RETAIL), true);
    assert.equal(isBranchRetailWholesaleCustomerType(CustomerType.MASTER), true);
    assert.equal(isBranchRetailWholesaleCustomerType(CustomerType.WHOLESALE), true);
    assert.equal(isBranchRetailWholesaleCustomerType(CustomerType.DEALER), false);
  });

  it('rejects mismatched pricing channel spoofing', () => {
    assert.throws(() =>
      assertSalePricingChannelMatchesCustomer(CustomerType.MASTER, 'RETAIL'),
    );
    assert.doesNotThrow(() =>
      assertSalePricingChannelMatchesCustomer(CustomerType.MASTER, 'MASTER'),
    );
  });
});
