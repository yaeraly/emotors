import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PaymentStatus,
  SaleInstallmentApprovalStatus,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import {
  assertCanDeleteInstallmentDraft,
  BRANCH_INSTALLMENT_DRAFT_DELETE_AUDIT,
  INSTALLMENT_DRAFT_DELETE_STATUS_CHANGED_MESSAGE,
  isDeletableInstallmentDraft,
} from './branch-installment-draft-delete.util';

function baseDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    branchId: 'branch-1',
    receiptNumber: 'EM-20260803-00001',
    status: SaleStatus.DRAFT,
    paymentType: SalePaymentType.INSTALLMENT,
    paidAmount: 0,
    paymentStatus: PaymentStatus.DEBT,
    sentToCashierAt: null,
    finalizedAt: null,
    cancelledAt: null,
    deletedAt: null,
    installmentApproval: {
      status: SaleInstallmentApprovalStatus.DRAFT,
      submittedAt: null,
      submittedById: null,
      approvedAt: null,
      approvedById: null,
      rejectedAt: null,
      payments: [],
    },
    payments: [],
    branchInvoice: null,
    salesCommissions: [],
    ...overrides,
  };
}

describe('branch installment draft delete eligibility', () => {
  it('allows untouched installment draft', () => {
    assert.equal(isDeletableInstallmentDraft(baseDraft()), true);
  });

  it('blocks submitted installment request', () => {
    assert.equal(
      isDeletableInstallmentDraft(
        baseDraft({
          installmentApproval: {
            ...baseDraft().installmentApproval,
            status: SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
            submittedAt: new Date(),
          },
        }),
      ),
      false,
    );
  });

  it('blocks approved installment', () => {
    assert.equal(
      isDeletableInstallmentDraft(
        baseDraft({
          installmentApproval: {
            ...baseDraft().installmentApproval,
            status: SaleInstallmentApprovalStatus.APPROVED,
            approvedAt: new Date(),
          },
        }),
      ),
      false,
    );
  });

  it('blocks paid sale', () => {
    assert.equal(
      isDeletableInstallmentDraft(
        baseDraft({
          paidAmount: 500,
          paymentStatus: PaymentStatus.PARTIAL,
        }),
      ),
      false,
    );
  });

  it('blocks finalized sale', () => {
    assert.equal(
      isDeletableInstallmentDraft(
        baseDraft({
          status: SaleStatus.FINALIZED,
          finalizedAt: new Date(),
        }),
      ),
      false,
    );
  });

  it('blocks sale with active invoice', () => {
    assert.equal(
      isDeletableInstallmentDraft(
        baseDraft({
          branchInvoice: { id: 'inv-1', deletedAt: null },
        }),
      ),
      false,
    );
  });

  it('blocks sale with payments', () => {
    assert.equal(
      isDeletableInstallmentDraft(
        baseDraft({
          payments: [{ id: 'pay-1' }],
          _count: { payments: 1 },
        }),
      ),
      false,
    );
  });

  it('throws status-changed conflict when approval is no longer draft', () => {
    assert.throws(
      () =>
        assertCanDeleteInstallmentDraft(
          baseDraft({
            installmentApproval: {
              ...baseDraft().installmentApproval,
              status: SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
            },
          }),
        ),
      (error: Error) => error.message === INSTALLMENT_DRAFT_DELETE_STATUS_CHANGED_MESSAGE,
    );
  });

  it('exports audit action constant', () => {
    assert.equal(BRANCH_INSTALLMENT_DRAFT_DELETE_AUDIT, 'BRANCH_INSTALLMENT_DRAFT_DELETED');
  });
});
