import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appliedPriceLabelKey,
  customerTypeLabelKey,
  resolvePricingChannelFromCustomerType,
} from './sale-customer-pricing';

describe('sale-customer-pricing', () => {
  it('defaults unknown customer type to retail pricing', () => {
    assert.equal(resolvePricingChannelFromCustomerType(undefined), 'RETAIL');
    assert.equal(resolvePricingChannelFromCustomerType('RETAIL'), 'RETAIL');
  });

  it('uses wholesale pricing for wholesale customers', () => {
    assert.equal(resolvePricingChannelFromCustomerType('WHOLESALE'), 'WHOLESALE');
  });

  it('maps label keys for customer type and applied price', () => {
    assert.equal(customerTypeLabelKey('RETAIL'), 'customers.customerTypeRetail');
    assert.equal(customerTypeLabelKey('WHOLESALE'), 'customers.customerTypeWholesale');
    assert.equal(appliedPriceLabelKey('RETAIL'), 'sales.appliedPriceRetail');
    assert.equal(appliedPriceLabelKey('WHOLESALE'), 'sales.appliedPriceWholesale');
  });
});
