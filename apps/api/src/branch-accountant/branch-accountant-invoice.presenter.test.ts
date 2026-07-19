import {
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  BranchOrderInstallmentStatus,
  BranchPaymentConfirmationStatus,
} from '@prisma/client';
import { resolveAccountantInvoiceWorkflowStatus } from './branch-accountant-invoice.presenter';

describe('resolveAccountantInvoiceWorkflowStatus', () => {
  it('returns PENDING_ACCOUNTANT_REVIEW for new branch invoices', () => {
    expect(
      resolveAccountantInvoiceWorkflowStatus({
        status: BranchInvoiceStatus.ISSUED,
        sentToBranchAt: new Date(),
        sentToCashierAt: null,
        paymentType: null,
      }),
    ).toBe('PENDING_ACCOUNTANT_REVIEW');
  });

  it('returns INSTALLMENT_APPROVAL_PENDING when installment is pending', () => {
    expect(
      resolveAccountantInvoiceWorkflowStatus({
        status: BranchInvoiceStatus.ISSUED,
        sentToBranchAt: new Date(),
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        branchOrderInstallment: { status: BranchOrderInstallmentStatus.PENDING },
      }),
    ).toBe('INSTALLMENT_APPROVAL_PENDING');
  });

  it('returns WAITING_FOR_PAYMENT after cashier handoff', () => {
    expect(
      resolveAccountantInvoiceWorkflowStatus({
        status: BranchInvoiceStatus.ISSUED,
        sentToBranchAt: new Date(),
        sentToCashierAt: new Date(),
        paymentType: BranchInvoicePaymentType.FULL_PAYMENT,
      }),
    ).toBe('WAITING_FOR_PAYMENT');
  });

  it('returns PAYMENT_SUBMITTED when payment awaits confirmation', () => {
    expect(
      resolveAccountantInvoiceWorkflowStatus({
        status: BranchInvoiceStatus.ISSUED,
        sentToBranchAt: new Date(),
        sentToCashierAt: new Date(),
        paymentType: BranchInvoicePaymentType.FULL_PAYMENT,
        payments: [{ confirmationStatus: BranchPaymentConfirmationStatus.PENDING_CONFIRMATION }],
      }),
    ).toBe('PAYMENT_SUBMITTED');
  });
});
