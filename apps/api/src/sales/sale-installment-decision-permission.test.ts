import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { isBranchOwnerUser, isBranchSalesManagerUser } from '../rbac/rbac';

const branchSalesManager = {
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
};

const branchOwner = {
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
};

const branchCashier = {
  role: Role.CASHIER,
  roles: [Role.CASHIER],
  branchId: 'branch-1',
  permissions: ['payments.manage', 'cashier'],
};

const otherBranchOwner = {
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-2',
  permissions: ['sales.manage'],
};

describe('branch installment decision role separation', () => {
  it('Branch Sales Manager can submit installment requests', () => {
    assert.equal(isBranchSalesManagerUser(branchSalesManager), true);
  });

  it('Branch Sales Manager cannot approve/reject/cancel installment requests (not Branch Owner/CEO)', () => {
    assert.equal(isBranchOwnerUser(branchSalesManager), false);
  });

  it('Branch CEO (Franchise Owner) can approve/reject/cancel installment requests', () => {
    assert.equal(isBranchOwnerUser(branchOwner), true);
  });

  it('Branch CEO cannot submit installment requests (submission is a Branch Sales Manager action)', () => {
    assert.equal(isBranchSalesManagerUser(branchOwner), false);
  });

  it('Branch Cashier cannot submit installment requests', () => {
    assert.equal(isBranchSalesManagerUser(branchCashier), false);
  });

  it('Branch Cashier cannot approve/reject/cancel installment requests', () => {
    assert.equal(isBranchOwnerUser(branchCashier), false);
  });

  it('Branch Owner scope is per-branch (does not implicitly grant cross-branch access)', () => {
    assert.equal(isBranchOwnerUser(otherBranchOwner), true);
    assert.notEqual(otherBranchOwner.branchId, branchOwner.branchId);
  });
});

describe('branch installment decision endpoints do not require cashier permission', () => {
  const controllerSource = readFileSync(join(__dirname, 'sales.controller.ts'), 'utf8');

  function extractHandler(routeDecorator: string, methodName: string) {
    const routeIndex = controllerSource.indexOf(routeDecorator);
    assert.ok(routeIndex >= 0, `route decorator not found: ${routeDecorator}`);
    const methodIndex = controllerSource.indexOf(methodName, routeIndex);
    assert.ok(methodIndex >= 0, `handler not found: ${methodName}`);
    return controllerSource.slice(routeIndex, methodIndex);
  }

  it('submit endpoint is not gated by CASHIER role', () => {
    const block = extractHandler('installment-request/submit', 'submitInstallmentRequest');
    assert.doesNotMatch(block, /Role\.CASHIER/);
  });

  it('approve endpoint is not gated by CASHIER role', () => {
    const block = extractHandler('installment-request/approve', 'approveInstallmentRequest');
    assert.doesNotMatch(block, /Role\.CASHIER/);
  });

  it('reject endpoint is not gated by CASHIER role', () => {
    const block = extractHandler('installment-request/reject', 'rejectInstallmentRequest');
    assert.doesNotMatch(block, /Role\.CASHIER/);
  });

  it('cancel endpoint is not gated by CASHIER role', () => {
    const block = extractHandler('installment-request/cancel', 'cancelInstallmentRequest');
    assert.doesNotMatch(block, /Role\.CASHIER/);
  });

  it('return-for-revision endpoint is not gated by CASHIER role', () => {
    const block = extractHandler('installment-request/return-for-revision', 'returnInstallmentRequestForRevision');
    assert.doesNotMatch(block, /Role\.CASHIER/);
  });

  it('real payment endpoint remains protected with CASHIER role', () => {
    const block = extractHandler("Post(':id/payments')", 'addPayment');
    assert.match(block, /Role\.CASHIER/);
  });
});

describe('branch installment decisions never create payment or cashbox side effects', () => {
  const serviceSource = readFileSync(join(__dirname, 'sale-installment-approval.service.ts'), 'utf8');

  function extractMethodBody(methodName: string) {
    const start = serviceSource.indexOf(`async ${methodName}(`);
    assert.ok(start >= 0, `method not found: ${methodName}`);
    const nextMethod = serviceSource.indexOf('\n  async ', start + 1);
    return serviceSource.slice(start, nextMethod === -1 ? undefined : nextMethod);
  }

  const forbiddenPatterns = [
    /tx\.payment\.create/,
    /tx\.saleInstallmentPayment\.create/,
    /cashbox/i,
    /bankAccount/i,
    /paidAmount:\s*sale/i,
  ];

  for (const methodName of [
    'submitInstallmentRequest',
    'approveInstallmentRequest',
    'rejectInstallmentRequest',
    'returnInstallmentRequestForRevision',
    'cancelInstallmentRequest',
  ]) {
    it(`${methodName} does not create a payment, cashbox, or bank transaction`, () => {
      const body = extractMethodBody(methodName);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(body, pattern, `${methodName} unexpectedly matched ${pattern}`);
      }
    });
  }

  it('approveInstallmentRequest does not mark the sale as paid', () => {
    const body = extractMethodBody('approveInstallmentRequest');
    assert.doesNotMatch(body, /tx\.sale\.update/);
  });
});
