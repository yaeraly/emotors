import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appliedPriceLabelKey,
  customerTypeLabelKey,
  formatBranchCustomerTypeDisplay,
  preserveSaleLineQuantity,
  resolvePricingChannelFromCustomerType,
} from './sale-customer-pricing';

const ruLabels: Record<string, string> = {
  'customers.customerTypeRetail': 'Розничный',
  'customers.customerTypeMaster': 'Мастер',
  'customers.customerTypeWholesale': 'Оптовый',
};

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
    assert.equal(customerTypeLabelKey('MASTER'), 'customers.customerTypeMaster');
    assert.equal(appliedPriceLabelKey('RETAIL'), 'sales.appliedPriceRetail');
    assert.equal(appliedPriceLabelKey('WHOLESALE'), 'sales.appliedPriceWholesale');
  });

  it('formats branch customer type labels in Russian without raw enums', () => {
    assert.equal(formatBranchCustomerTypeDisplay('RETAIL', (key) => ruLabels[key] ?? key), 'Розничный');
    assert.equal(formatBranchCustomerTypeDisplay('MASTER', (key) => ruLabels[key] ?? key), 'Мастер');
    assert.equal(formatBranchCustomerTypeDisplay('WHOLESALE', (key) => ruLabels[key] ?? key), 'Оптовый');
    assert.equal(formatBranchCustomerTypeDisplay(undefined, (key) => ruLabels[key] ?? key), '—');
    assert.equal(formatBranchCustomerTypeDisplay('DEALER', (key) => ruLabels[key] ?? key), '—');
    assert.equal(formatBranchCustomerTypeDisplay('RETAIL', (key) => ruLabels[key] ?? key), 'Розничный');
    assert.doesNotMatch(formatBranchCustomerTypeDisplay('RETAIL', (key) => ruLabels[key] ?? key), /RETAIL/);
  });

  it('preserves quantity when refreshing draft line prices', () => {
    const existing = { quantity: '5', unitPrice: '100' };
    const refreshed = { quantity: '1', unitPrice: '80' };
    const merged = preserveSaleLineQuantity(existing, refreshed);
    assert.equal(merged.quantity, '5');
    assert.equal(merged.unitPrice, '80');
  });
});

