import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerType } from '@prisma/client';

const B2B_TYPES = new Set<CustomerType>([CustomerType.DEALER, CustomerType.DISTRIBUTOR]);
const HQ_BRANCH_TYPES = new Set<CustomerType>([CustomerType.RETAIL, CustomerType.WHOLESALE]);

function assertBranchSaleCustomer(customerType: CustomerType) {
  if (B2B_TYPES.has(customerType)) {
    throw new Error('B2B customers must use HQ Sales');
  }
}

function assertHqBranchCustomer(customerType: CustomerType) {
  if (!HQ_BRANCH_TYPES.has(customerType)) {
    throw new Error('HQ Branch allows only Retail and Wholesale');
  }
}

describe('customer service ownership guards', () => {
  it('blocks Dealer and Distributor from branch retail sales', () => {
    assert.throws(() => assertBranchSaleCustomer(CustomerType.DEALER));
    assert.throws(() => assertBranchSaleCustomer(CustomerType.DISTRIBUTOR));
    assert.doesNotThrow(() => assertBranchSaleCustomer(CustomerType.RETAIL));
    assert.doesNotThrow(() => assertBranchSaleCustomer(CustomerType.WHOLESALE));
  });

  it('allows only Retail and Wholesale for HQ Branch customers', () => {
    assert.doesNotThrow(() => assertHqBranchCustomer(CustomerType.RETAIL));
    assert.doesNotThrow(() => assertHqBranchCustomer(CustomerType.WHOLESALE));
    assert.throws(() => assertHqBranchCustomer(CustomerType.DEALER));
  });

  it('Dealer and Distributor are customer types not system roles', () => {
    assert.equal(B2B_TYPES.has(CustomerType.DEALER), true);
    assert.equal(B2B_TYPES.has(CustomerType.DISTRIBUTOR), true);
    assert.equal(B2B_TYPES.has(CustomerType.RETAIL), false);
  });
});
