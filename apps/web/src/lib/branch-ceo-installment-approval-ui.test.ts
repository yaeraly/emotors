import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  canAcceptSalePayment,
  canManageBranchSaleWorkflow,
  canVoidPayment,
  isBranchOwnerUser,
} from './rbac';
import { canReturnInstallmentForRevision } from './sale-installment';

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
  permissions: ['cashier', 'payments.manage'],
};

const branchSalesManager = {
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
};

describe('branch ceo installment approval permissions', () => {
  it('identifies branch ceo separately from sales manager workflow', () => {
    assert.equal(isBranchOwnerUser(branchOwner), true);
    assert.equal(canManageBranchSaleWorkflow(branchOwner), false);
    assert.equal(canManageBranchSaleWorkflow(branchSalesManager), true);
  });

  it('blocks branch ceo from recording sale payments', () => {
    assert.equal(canVoidPayment(branchOwner), false);
    assert.equal(canAcceptSalePayment(branchOwner), false);
    assert.equal(canVoidPayment(branchCashier), true);
    assert.equal(canAcceptSalePayment(branchCashier), true);
  });

  it('allows return for revision only while pending ceo decision', () => {
    assert.equal(canReturnInstallmentForRevision({ status: 'PENDING_BRANCH_CEO_APPROVAL' }), true);
    assert.equal(canReturnInstallmentForRevision({ status: 'APPROVED' }), false);
  });
});

describe('branch ceo installment approval ui', () => {
  const requestsSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/sales/installment-requests/page.tsx'),
    'utf8',
  );
  const detailSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../app/sales/[id]/page.tsx'),
    'utf8',
  );

  it('shows only ceo review actions on installment requests page', () => {
    assert.match(requestsSource, /sales\.approveInstallment/);
    assert.match(requestsSource, /sales\.rejectInstallment/);
    assert.match(requestsSource, /sales\.returnForRevision/);
    assert.match(requestsSource, /sales\.cancelInstallment/);
    assert.doesNotMatch(requestsSource, /sales\.addPayment/);
    assert.doesNotMatch(requestsSource, /sales\.finalizeSale/);
    assert.doesNotMatch(requestsSource, /common\.edit/);
  });

  it('uses comment textarea instead of approval comment button', () => {
    assert.match(requestsSource, /<textarea[\s\S]*approvalComment/);
    assert.match(detailSource, /<textarea[\s\S]*approvalComment/);
  });

  it('removes payment and finalize actions from branch ceo sale detail', () => {
    assert.match(detailSource, /canManageBranchSaleWorkflow/);
    assert.match(detailSource, /canReviewInstallment/);
    assert.match(detailSource, /return-for-revision/);
    assert.doesNotMatch(detailSource, /canManageSaleWorkflow/);
  });

  it('keeps whatsapp as informational action for ceo review', () => {
    assert.match(detailSource, /sales\.sendWhatsApp/);
  });
});
