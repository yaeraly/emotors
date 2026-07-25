import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  canApproveHqB2bInstallment,
  canConfirmHqB2bPayment,
  canConvertCustomerToFranchise,
  canManageHqB2bSales,
} from '../rbac/rbac';

function user(role: Role) {
  return { role, roles: [role], permissions: [] as string[] };
}

describe('HQ B2B RBAC', () => {
  it('HQ Sales can manage B2B sales', () => {
    assert.equal(canManageHqB2bSales(user(Role.HQ_SALES_MANAGER)), true);
    assert.equal(canManageHqB2bSales(user(Role.HQ_ACCOUNTANT)), false);
  });

  it('only HQ Accountant confirms payments', () => {
    assert.equal(canConfirmHqB2bPayment(user(Role.HQ_ACCOUNTANT)), true);
    assert.equal(canConfirmHqB2bPayment(user(Role.HQ_SALES_MANAGER)), false);
    assert.equal(canConfirmHqB2bPayment(user(Role.FINANCE_MANAGER)), false);
  });

  it('only CEO approves installment terms', () => {
    assert.equal(canApproveHqB2bInstallment(user(Role.CEO)), true);
    assert.equal(canApproveHqB2bInstallment(user(Role.HQ_SALES_MANAGER)), false);
    assert.equal(canApproveHqB2bInstallment(user(Role.HQ_ACCOUNTANT)), false);
  });

  it('only CEO converts customers to franchise', () => {
    assert.equal(canConvertCustomerToFranchise(user(Role.CEO)), true);
    assert.equal(canConvertCustomerToFranchise(user(Role.HQ_SALES_MANAGER)), false);
  });
});
