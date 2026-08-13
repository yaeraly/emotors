import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { getCustomerListColumns, shouldShowCustomerListEditButton } from './customer-table-config';

describe('getCustomerListColumns', () => {
  it('includes customerType column for branch sales manager after fullName', () => {
    const columns = getCustomerListColumns({
      role: Role.MANAGER,
      roles: [Role.MANAGER],
      branchId: 'branch-1',
    });

    assert.ok(columns.includes('customerType'));
    assert.equal(columns.indexOf('customerType'), columns.indexOf('fullName') + 1);
    assert.equal(columns.filter((key) => key === 'customerType').length, 1);
  });

  it('includes customerType column for branch owner after fullName', () => {
    const columns = getCustomerListColumns({
      role: Role.FRANCHISE_OWNER,
      roles: [Role.FRANCHISE_OWNER],
      branchId: 'branch-1',
    });

    assert.ok(columns.includes('customerType'));
    assert.equal(columns.indexOf('customerType'), columns.indexOf('fullName') + 1);
  });

  it('does not add customerType column for HQ users', () => {
    const columns = getCustomerListColumns({
      role: Role.CEO,
      roles: [Role.CEO],
      branchId: null,
    });

    assert.equal(columns.includes('customerType'), false);
  });
});

describe('shouldShowCustomerListEditButton', () => {
  it('hides edit for branch CEO and branch sales manager', () => {
    assert.equal(
      shouldShowCustomerListEditButton({
        role: Role.FRANCHISE_OWNER,
        roles: [Role.FRANCHISE_OWNER],
        branchId: 'branch-1',
      }),
      false,
    );
    assert.equal(
      shouldShowCustomerListEditButton({
        role: Role.MANAGER,
        roles: [Role.MANAGER],
        branchId: 'branch-1',
      }),
      false,
    );
  });

  it('keeps edit for HQ users', () => {
    assert.equal(
      shouldShowCustomerListEditButton({
        role: Role.CEO,
        roles: [Role.CEO],
        branchId: null,
      }),
      true,
    );
  });
});
