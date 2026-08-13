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
  const scope = classifyRetailInstallmentCashierScope(invoice);
  return scope === 'active' || scope === 'overdue';
}

export type RetailInstallmentCashierScope = 'active' | 'overdue' | 'closed';

export function classifyRetailInstallmentCashierScope(
  invoice: RetailInstallmentInvoiceLike,
  now: Date = new Date(),
): RetailInstallmentCashierScope | null {
  if (!invoice.sentToCashierAt) return null;
  if (invoice.status === BranchInvoiceStatus.CANCELLED || invoice.status === 'CANCELLED') {
    return null;
  }

  const approval = invoice.sale?.installmentApproval;
  if (!approval) return null;
  if (approval.status === 'CANCELLED' || approval.status === 'REJECTED') {
    return null;
  }

  const remainingDebt = resolveRetailInstallmentRemainingDebt(invoice);
  const isClosed =
    invoice.status === BranchInvoiceStatus.PAID ||
    invoice.status === 'PAID' ||
    approval.status === 'PAID' ||
    remainingDebt <= 0.009;

  if (isClosed) return 'closed';

  const dueDateRaw = approval.dueDate;
  if (dueDateRaw) {
    const dueDate = new Date(dueDateRaw);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(dueDate);
    dueDay.setHours(0, 0, 0, 0);
    if (dueDay.getTime() < today.getTime()) {
      return 'overdue';
    }
  }

  return 'active';
}

export function isRetailInstallmentInCashierScope(
  invoice: RetailInstallmentInvoiceLike,
  scope: RetailInstallmentCashierScope | 'all' = 'active',
  now: Date = new Date(),
) {
  const classified = classifyRetailInstallmentCashierScope(invoice, now);
  if (!classified) return false;
  if (scope === 'all') return true;
  return classified === scope;
}

export { isZeroInitialPayment };
