import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { canEditCustomer } from '../rbac/rbac';

describe('canEditCustomer', () => {
  it('denies branch CEO and branch sales manager', () => {
    assert.equal(
      canEditCustomer({
        role: Role.FRANCHISE_OWNER,
        roles: [Role.FRANCHISE_OWNER],
        branchId: 'branch-1',
      }),
      false,
    );
    assert.equal(
      canEditCustomer({
        role: Role.MANAGER,
        roles: [Role.MANAGER],
        branchId: 'branch-1',
      }),
      false,
    );
  });

  it('allows HQ full-access users', () => {
    assert.equal(
      canEditCustomer({
        role: Role.CEO,
        roles: [Role.CEO],
        branchId: null,
      }),
      true,
    );
  });
});
