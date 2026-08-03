import {
  BranchInstallmentEarlyPaymentStatus,
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  BranchOrderInstallmentStatus,
} from '@prisma/client';
import { CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES } from './branch-installment-early-payment.util';
import {
  isRetailInstallmentCashierVisible,
  isRetailInstallmentInvoice,
  resolveRetailInstallmentInitialPayment,
  resolveRetailInstallmentPaidAmount,
  resolveRetailInstallmentRemainingDebt,
  resolveRetailInstallmentRequiredPayment,
} from '../sales/sale-installment-invoice.util';

export type CashierVisibilityInvoiceLike = {
  invoiceCategory?: string | null;
  saleId?: string | null;
  sentToCashierAt?: Date | string | null;
  status: BranchInvoiceStatus | string;
  paymentType?: BranchInvoicePaymentType | string | null;
  totalAmount?: number | { toString(): string };
  paidAmount?: number | { toString(): string };
  debtAmount?: number | { toString(): string };
  sale?: {
    installmentApproval?: {
      status: string;
      initialPayment: number | { toString(): string };
      installmentPaidAmount?: number | { toString(): string } | null;
      remainingDebt?: number | { toString(): string } | null;
      financedAmount: number | { toString(): string };
      dueDate?: Date | string | null;
      requestNumber?: string;
    } | null;
  } | null;
  branchOrderInstallment?: {
    status: BranchOrderInstallmentStatus | string;
    firstPaymentRequired?: boolean;
    firstPaymentConfirmed?: boolean;
  } | null;
  installmentEarlyPaymentRequests?: Array<{
    status: BranchInstallmentEarlyPaymentStatus | string;
    sentToCashierAt?: Date | string | null;
  }>;
};

/**
 * Backend rule for Branch Cashier → Счета к оплате visibility.
 * CEO approval alone is never enough; Accountant must send explicitly.
 */
export function isBranchCashierInvoiceVisible(invoice: CashierVisibilityInvoiceLike): boolean {
  if (!invoice.sentToCashierAt) return false;
  if (
    invoice.status === BranchInvoiceStatus.PAID ||
    invoice.status === BranchInvoiceStatus.CANCELLED ||
    invoice.status === 'PAID' ||
    invoice.status === 'CANCELLED'
  ) {
    return false;
  }

  const retailApproval = invoice.sale?.installmentApproval;
  if (
    retailApproval?.status === 'REJECTED' ||
    retailApproval?.status === 'CANCELLED'
  ) {
    return false;
  }

  const earlyRequests = invoice.installmentEarlyPaymentRequests ?? [];
  const hasCeoApprovedNotSent = earlyRequests.some(
    (row) => row.status === BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
  );
  if (hasCeoApprovedNotSent) return false;

  const hasPendingCeo = earlyRequests.some(
    (row) => row.status === BranchInstallmentEarlyPaymentStatus.PENDING_BRANCH_CEO_APPROVAL,
  );
  if (hasPendingCeo) return false;

  const hasRejectedOnly =
    earlyRequests.length > 0 &&
    earlyRequests.every(
      (row) =>
        row.status === BranchInstallmentEarlyPaymentStatus.REJECTED_BY_BRANCH_CEO ||
        row.status === BranchInstallmentEarlyPaymentStatus.CANCELLED ||
        row.status === BranchInstallmentEarlyPaymentStatus.PAYMENT_CONFIRMED,
    );
  if (hasRejectedOnly && !earlyRequests.some((row) => isSentEarlyPayment(row))) {
    // Rejected/cancelled requests never create cashier visibility by themselves.
  }

  const sentEarly = earlyRequests.find((row) => isSentEarlyPayment(row));
  if (sentEarly) return true;

  if (invoice.paymentType === BranchInvoicePaymentType.FULL_PAYMENT || invoice.paymentType === 'FULL_PAYMENT') {
    return true;
  }

  const installment = invoice.branchOrderInstallment;
  if (
    installment &&
    (installment.status === BranchOrderInstallmentStatus.APPROVED || installment.status === 'APPROVED') &&
    installment.firstPaymentRequired &&
    !installment.firstPaymentConfirmed
  ) {
    return true;
  }

  // Zero-initial or post-first-payment installment: invisible until early payment is sent.
  if (isRetailInstallmentInvoice(invoice as Parameters<typeof isRetailInstallmentInvoice>[0])) {
    return isRetailInstallmentCashierVisible(invoice as Parameters<typeof isRetailInstallmentCashierVisible>[0]);
  }

  return false;
}

function isSentEarlyPayment(row: {
  status: BranchInstallmentEarlyPaymentStatus | string;
  sentToCashierAt?: Date | string | null;
}) {
  return (
    !!row.sentToCashierAt &&
    CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES.includes(row.status as BranchInstallmentEarlyPaymentStatus)
  );
}
