import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canEditCustomerType } from '../rbac/rbac';

describe('canEditCustomerType', () => {
  it('allows branch sales manager (MANAGER)', () => {
    assert.equal(
      canEditCustomerType({ role: 'MANAGER', roles: ['MANAGER'], branchId: 'branch-1' }),
      true,
    );
  });

  it('allows franchise owner', () => {
    assert.equal(
      canEditCustomerType({ role: 'FRANCHISE_OWNER', roles: ['FRANCHISE_OWNER'], branchId: 'b' }),
      true,
    );
  });

  it('denies branch cashier from changing customer type', () => {
    assert.equal(
      canEditCustomerType({ role: 'CASHIER', roles: ['CASHIER'], branchId: 'branch-1' }),
      false,
    );
  });

  it('denies warehouse operator from changing customer type', () => {
    assert.equal(
      canEditCustomerType({
        role: 'WAREHOUSE_OPERATOR',
        roles: ['WAREHOUSE_OPERATOR'],
        branchId: 'branch-1',
      }),
      false,
    );
  });
});
