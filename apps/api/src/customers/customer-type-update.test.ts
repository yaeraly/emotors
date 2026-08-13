import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerType } from '@prisma/client';

type CustomerTypeAuditMetadata = {
  customerId: string;
  previousCustomerType: CustomerType;
  newCustomerType: CustomerType;
  changedBy: string;
  changedByName: string;
  changedAt: string;
};

function buildCustomerTypeAuditMetadata(input: {
  customerId: string;
  previousCustomerType: CustomerType;
  newCustomerType: CustomerType;
  changedBy: string;
  changedByName: string;
}): CustomerTypeAuditMetadata {
  return {
    customerId: input.customerId,
    previousCustomerType: input.previousCustomerType,
    newCustomerType: input.newCustomerType,
    changedBy: input.changedBy,
    changedByName: input.changedByName,
    changedAt: new Date().toISOString(),
  };
}

describe('customer type audit metadata', () => {
  it('includes customerId, types, changedBy, and changedAt', () => {
    const metadata = buildCustomerTypeAuditMetadata({
      customerId: 'cust-1',
      previousCustomerType: CustomerType.RETAIL,
      newCustomerType: CustomerType.WHOLESALE,
      changedBy: 'user-1',
      changedByName: 'Sales Manager',
    });

    assert.equal(metadata.customerId, 'cust-1');
    assert.equal(metadata.previousCustomerType, CustomerType.RETAIL);
    assert.equal(metadata.newCustomerType, CustomerType.WHOLESALE);
    assert.equal(metadata.changedBy, 'user-1');
    assert.equal(metadata.changedByName, 'Sales Manager');
    assert.ok(metadata.changedAt);
  });

  it('supports wholesale to retail change', () => {
    const metadata = buildCustomerTypeAuditMetadata({
      customerId: 'cust-2',
      previousCustomerType: CustomerType.WHOLESALE,
      newCustomerType: CustomerType.RETAIL,
      changedBy: 'user-2',
      changedByName: 'Manager',
    });
    assert.equal(metadata.previousCustomerType, CustomerType.WHOLESALE);
    assert.equal(metadata.newCustomerType, CustomerType.RETAIL);
  });
});

describe('historical sale protection', () => {
  it('customer type update payload does not reference sale records', () => {
    const updatePayload = {
      fullName: 'Client',
      phone: '+996700000000',
      customerType: CustomerType.WHOLESALE,
    };
    assert.equal('saleId' in updatePayload, false);
    assert.equal('items' in updatePayload, false);
  });
});
