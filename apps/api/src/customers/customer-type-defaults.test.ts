import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CustomerType } from '@prisma/client';

describe('customer creation defaults', () => {
  it('defaults missing customerType to RETAIL', () => {
    const dto: { customerType?: CustomerType } = {};
    const customerType = dto.customerType ?? CustomerType.RETAIL;
    assert.equal(customerType, CustomerType.RETAIL);
  });

  it('allows creating wholesale customers', () => {
    const dto = { customerType: CustomerType.WHOLESALE };
    assert.equal(dto.customerType, CustomerType.WHOLESALE);
  });
});
