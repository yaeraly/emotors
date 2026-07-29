import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerType } from '@prisma/client';
import {
  assertBranchSaleCustomerTypeAllowed,
  assertSalePricingChannelMatchesCustomer,
  missingSalePricingPolicyMessage,
  resolvePricingChannelFromCustomerType,
} from './sale-customer-pricing.util';

describe('sale-customer-pricing.util', () => {
  it('maps retail customer to retail pricing channel', () => {
    assert.equal(
      resolvePricingChannelFromCustomerType(CustomerType.RETAIL),
      'RETAIL',
    );
  });

  it('maps wholesale customer to wholesale pricing channel', () => {
    assert.equal(
      resolvePricingChannelFromCustomerType(CustomerType.WHOLESALE),
      'WHOLESALE',
    );
  });

  it('rejects manipulated pricing channel from frontend', () => {
    assert.throws(() =>
      assertSalePricingChannelMatchesCustomer(CustomerType.RETAIL, 'WHOLESALE'),
    );
    assert.throws(() =>
      assertSalePricingChannelMatchesCustomer(CustomerType.WHOLESALE, 'RETAIL'),
    );
    assert.doesNotThrow(() =>
      assertSalePricingChannelMatchesCustomer(CustomerType.RETAIL, 'RETAIL'),
    );
  });

  it('blocks B2B customer types from branch sales', () => {
    assert.throws(() => assertBranchSaleCustomerTypeAllowed(CustomerType.DEALER));
    assert.throws(() => assertBranchSaleCustomerTypeAllowed(CustomerType.DISTRIBUTOR));
    assert.doesNotThrow(() => assertBranchSaleCustomerTypeAllowed(CustomerType.RETAIL));
    assert.doesNotThrow(() => assertBranchSaleCustomerTypeAllowed(CustomerType.WHOLESALE));
  });

  it('returns clear missing shared-price messages per channel', () => {
    assert.equal(
      missingSalePricingPolicyMessage('RETAIL'),
      'Для товара не настроена единая розничная цена.',
    );
    assert.equal(
      missingSalePricingPolicyMessage('WHOLESALE'),
      'Для товара не настроена единая оптовая цена.',
    );
  });
});
