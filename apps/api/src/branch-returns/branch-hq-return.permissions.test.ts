import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  canApproveBranchHqReturn,
  canCreateBranchHqReturn,
  canDecideBranchHqReturnFinance,
  canReceiveBranchHqReturnAtHq,
  canViewAllBranchHqReturns,
} from './branch-hq-return.permissions';

describe('branch hq return permissions', () => {
  it('allows branch warehouse to create and hq warehouse to receive', () => {
    assert.equal(
      canCreateBranchHqReturn({
        role: Role.WAREHOUSE_OPERATOR,
        roles: [Role.WAREHOUSE_OPERATOR],
        branchId: 'b1',
      }),
      true,
    );
    assert.equal(
      canReceiveBranchHqReturnAtHq({
        role: Role.WAREHOUSE_MANAGER,
        roles: [Role.WAREHOUSE_MANAGER],
      }),
      true,
    );
  });

  it('allows branch manager/owner approve and hq finance decide', () => {
    assert.equal(
      canApproveBranchHqReturn({
        role: Role.MANAGER,
        roles: [Role.MANAGER],
        branchId: 'b1',
      }),
      true,
    );
    assert.equal(
      canApproveBranchHqReturn({
        role: Role.FRANCHISE_OWNER,
        roles: [Role.FRANCHISE_OWNER],
        branchId: 'b1',
      }),
      true,
    );
    assert.equal(
      canDecideBranchHqReturnFinance({
        role: Role.HQ_ACCOUNTANT,
        roles: [Role.HQ_ACCOUNTANT],
      }),
      true,
    );
  });

  it('does not let hq sales manage returns', () => {
    assert.equal(
      canCreateBranchHqReturn({
        role: Role.HQ_SALES_MANAGER,
        roles: [Role.HQ_SALES_MANAGER],
        branchId: '',
      }),
      false,
    );
    assert.equal(
      canApproveBranchHqReturn({
        role: Role.HQ_SALES_MANAGER,
        roles: [Role.HQ_SALES_MANAGER],
        branchId: '',
      }),
      false,
    );
    assert.equal(
      canViewAllBranchHqReturns({
        role: Role.CEO,
        roles: [Role.CEO],
      }),
      true,
    );
  });
});
