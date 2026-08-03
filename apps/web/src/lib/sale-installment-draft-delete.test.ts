import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canDeleteInstallmentDraft } from './rbac';
import { isDeletableInstallmentDraft } from './sale-installment';
import type { Sale, User } from './types';

const branchSalesManager: User = {
  id: 'mgr-1',
  username: 'manager',
  email: 'manager@test.local',
  fullName: 'Branch Sales Manager',
  role: 'MANAGER',
  roles: ['MANAGER'],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
  status: 'ACTIVE',
};

const otherBranchManager: User = {
  ...branchSalesManager,
  id: 'mgr-2',
  branchId: 'branch-2',
};

function installmentDraftSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1',
    branchId: 'branch-1',
    customerId: 'cust-1',
    customer: {
      id: 'cust-1',
      fullName: 'Customer',
      phone: '+996700000000',
      branchId: 'branch-1',
      status: 'ACTIVE',
      customerType: 'RETAIL',
      totalDebtAmount: 0,
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    sellerId: 'mgr-1',
    receiptNumber: 'EM-20260803-00001',
    saleDate: '2026-08-03T00:00:00.000Z',
    totalAmount: 1000,
    totalCost: 500,
    profitAmount: 500,
    paidAmount: 0,
    debtAmount: 1000,
    paymentStatus: 'DEBT',
    paymentType: 'INSTALLMENT',
    status: 'DRAFT',
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    installmentApproval: {
      id: 'approval-1',
      saleId: 'sale-1',
      branchId: 'branch-1',
      requestNumber: 'SI-BR-00001',
      status: 'DRAFT',
      requestVersion: 1,
      totalAmount: 1000,
      initialPayment: 100,
      financedAmount: 900,
      paymentCount: 1,
    },
    ...overrides,
  };
}

describe('installment draft delete visibility', () => {
  it('shows delete for installment draft', () => {
    const sale = installmentDraftSale();
    assert.equal(isDeletableInstallmentDraft(sale), true);
    assert.equal(canDeleteInstallmentDraft(branchSalesManager, sale), true);
  });

  it('hides delete for submitted installment', () => {
    const sale = installmentDraftSale({
      installmentApproval: {
        ...installmentDraftSale().installmentApproval!,
        status: 'PENDING_BRANCH_CEO_APPROVAL',
        submittedAt: '2026-08-03T01:00:00.000Z',
      },
    });
    assert.equal(isDeletableInstallmentDraft(sale), false);
    assert.equal(canDeleteInstallmentDraft(branchSalesManager, sale), false);
  });

  it('hides delete for approved installment', () => {
    const sale = installmentDraftSale({
      installmentApproval: {
        ...installmentDraftSale().installmentApproval!,
        status: 'APPROVED',
        approvedAt: '2026-08-03T01:00:00.000Z',
      },
    });
    assert.equal(canDeleteInstallmentDraft(branchSalesManager, sale), false);
  });

  it('hides delete for another branch draft', () => {
    const sale = installmentDraftSale({ branchId: 'branch-1' });
    assert.equal(canDeleteInstallmentDraft(otherBranchManager, sale), false);
  });
});
