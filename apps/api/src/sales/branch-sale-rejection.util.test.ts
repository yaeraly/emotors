import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchInvoiceStatus, SaleInstallmentApprovalStatus } from '@prisma/client';
import {
  assertRetailSaleFinanceAllowed,
  buildActiveAccountantInvoiceWhere,
  canReturnRejectedSaleToDraft,
  isRetailSaleWorkflowStopped,
} from './branch-sale-rejection.util';

describe('isRetailSaleWorkflowStopped', () => {
  it('treats rejected and cancelled approvals as stopped', () => {
    assert.equal(isRetailSaleWorkflowStopped({ status: 'REJECTED' }), true);
    assert.equal(isRetailSaleWorkflowStopped({ status: 'CANCELLED' }), true);
    assert.equal(isRetailSaleWorkflowStopped({ status: 'APPROVED' }), false);
    assert.equal(isRetailSaleWorkflowStopped(null), false);
  });
});

describe('canReturnRejectedSaleToDraft', () => {
  it('allows return only from rejected or cancelled approvals', () => {
    assert.equal(canReturnRejectedSaleToDraft({ status: 'REJECTED' }), true);
    assert.equal(canReturnRejectedSaleToDraft({ status: 'CANCELLED' }), true);
    assert.equal(canReturnRejectedSaleToDraft({ status: 'DRAFT' }), false);
  });
});

describe('assertRetailSaleFinanceAllowed', () => {
  it('blocks cancelled invoices and rejected sales', () => {
    assert.throws(
      () =>
        assertRetailSaleFinanceAllowed({
          invoiceStatus: BranchInvoiceStatus.CANCELLED,
        }),
      /аннулирован/,
    );
    assert.throws(
      () =>
        assertRetailSaleFinanceAllowed({
          installmentApproval: { status: SaleInstallmentApprovalStatus.REJECTED },
        }),
      /отклонена Branch CEO/,
    );
    assert.doesNotThrow(() =>
      assertRetailSaleFinanceAllowed({
        invoiceStatus: BranchInvoiceStatus.ISSUED,
        installmentApproval: { status: SaleInstallmentApprovalStatus.APPROVED },
      }),
    );
  });
});

describe('buildActiveAccountantInvoiceWhere', () => {
  it('excludes cancelled invoices and rejected retail sales from active queues', () => {
    const where = buildActiveAccountantInvoiceWhere('branch-a');
    assert.equal(where.branchId, 'branch-a');
    assert.deepEqual(where.status, { not: BranchInvoiceStatus.CANCELLED });
    assert.deepEqual(
      (where.NOT as { sale: { installmentApproval: { status: { in: string[] } } } }).sale
        .installmentApproval.status.in,
      ['REJECTED', 'CANCELLED'],
    );
  });
});
