import { BranchInvoicePaymentType, BranchInvoiceStatus } from '@prisma/client';
import { isZeroInitialPayment } from '../distribution/branch-order-installment.util';

export type RetailInstallmentInvoiceLike = {
  paymentType?: BranchInvoicePaymentType | string | null;
  status: BranchInvoiceStatus | string;
  totalAmount: number | { toString(): string };
  paidAmount: number | { toString(): string };
  debtAmount: number | { toString(): string };
  sentToCashierAt?: Date | string | null;
  sale?: {
    installmentApproval?: {
      status: string;
      initialPayment: number | { toString(): string };
      installmentPaidAmount?: number | { toString(): string } | null;
      remainingDebt?: number | { toString(): string } | null;
      financedAmount: number | { toString(): string };
      dueDate?: Date | string | null;
    } | null;
  } | null;
};

export function isRetailInstallmentInvoice(invoice: {
  invoiceCategory?: string | null;
  paymentType?: BranchInvoicePaymentType | string | null;
  saleId?: string | null;
}) {
  return (
    invoice.invoiceCategory === 'RETAIL_SALE' &&
    Boolean(invoice.saleId) &&
    (invoice.paymentType === BranchInvoicePaymentType.INSTALLMENT ||
      invoice.paymentType === 'INSTALLMENT')
  );
}

export function resolveRetailInstallmentInitialPayment(
  approval?: RetailInstallmentInvoiceLike['sale'] extends infer S
    ? S extends { installmentApproval?: infer A }
      ? A
      : never
    : never,
) {
  if (!approval) return 0;
  return Number(approval.initialPayment ?? 0);
}

export function resolveRetailInstallmentPaidAmount(invoice: RetailInstallmentInvoiceLike) {
  const approval = invoice.sale?.installmentApproval;
  if (approval?.installmentPaidAmount != null) {
    return Number(approval.installmentPaidAmount);
  }
  return Number(invoice.paidAmount ?? 0);
}

export function resolveRetailInstallmentRemainingDebt(invoice: RetailInstallmentInvoiceLike) {
  const approval = invoice.sale?.installmentApproval;
  if (approval?.remainingDebt != null) {
    return Number(approval.remainingDebt);
  }
  return Number(invoice.debtAmount ?? 0);
}

export function resolveRetailInstallmentRequiredPayment(invoice: RetailInstallmentInvoiceLike) {
  const approval = invoice.sale?.installmentApproval;
  const initialPayment = resolveRetailInstallmentInitialPayment(approval);
  const paidAmount = resolveRetailInstallmentPaidAmount(invoice);
  const remainingDebt = resolveRetailInstallmentRemainingDebt(invoice);

  if (!approval || approval.status === 'APPROVED') {
    if (!isZeroInitialPayment(initialPayment) && paidAmount + 0.009 < initialPayment) {
      return Math.max(initialPayment - paidAmount, 0);
    }
  }

  return remainingDebt;
}

export function isRetailInstallmentCashierVisible(invoice: RetailInstallmentInvoiceLike) {
  if (!invoice.sentToCashierAt) return false;
  if (invoice.status === BranchInvoiceStatus.PAID || invoice.status === 'PAID') return false;
  if (invoice.status === BranchInvoiceStatus.CANCELLED || invoice.status === 'CANCELLED') {
    return false;
  }
  const approval = invoice.sale?.installmentApproval;
  if (!approval) return false;
  if (approval.status === 'PAID' || approval.status === 'CANCELLED' || approval.status === 'REJECTED') {
    return false;
  }
  return resolveRetailInstallmentRemainingDebt(invoice) > 0.009;
}

export { isZeroInitialPayment };
