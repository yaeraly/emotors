import { ProcurementSupplierPaymentLedgerStatus } from '@prisma/client';
import { isSupplierInvoiceAccountantProcessed } from './hq-receiving-validation.util';
import { isSupplierPaymentApprovedForLandedCost } from './procurement-cost.util';
import {
  getCargoBillActionVisibility,
  type CargoBillActionVisibility,
} from './cargo-bill-actions.util';

export type SupplierApprovalStatus =
  | 'WAITING_FOR_ACCOUNTANT'
  | 'PROCESSED'
  | 'RETURNED_FOR_CORRECTION';

export type SupplierBillUiStatus =
  | 'AWAITING_ACCOUNTANT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PARTIALLY_PAID'
  | 'PAYMENT_POSTPONED'
  | 'FULLY_PAID'
  | 'RETURNED'
  | 'REJECTED'
  | 'CANCELLED';

export type SupplierBillActionVisibility = CargoBillActionVisibility;

export const SUPPLIER_RETURN_BLOCKED_MESSAGE =
  'По счету уже есть платежи. Для изменения суммы используйте корректировку финансового документа.';

export const SUPPLIER_ACCOUNTANT_PAYABLE = new Set<string>([
  ProcurementSupplierPaymentLedgerStatus.AWAITING_ACCOUNTANT,
  ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID,
  ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED,
]);

export function resolveSupplierApprovalStatus(input: {
  invoiceReviewStatus?: string | null;
  supplierPaymentStatus?: string | null;
}): SupplierApprovalStatus {
  const review = String(input.invoiceReviewStatus ?? '').toUpperCase();
  if (review === 'RETURNED') {
    return 'RETURNED_FOR_CORRECTION';
  }
  if (
    isSupplierPaymentApprovedForLandedCost({
      invoiceReviewStatus: input.invoiceReviewStatus,
      supplierPaymentStatus: input.supplierPaymentStatus,
    })
  ) {
    return 'PROCESSED';
  }
  return 'WAITING_FOR_ACCOUNTANT';
}

export function resolveSupplierPaymentStatusLabel(
  supplierPaymentStatus?: string | null,
  paidAmountKgs?: number | null,
  approvedAmountKgs?: number | null,
): 'UNPAID' | 'PARTIALLY_PAID' | 'POSTPONED' | 'PAID' {
  const ledger = String(supplierPaymentStatus ?? '').toUpperCase();
  if (ledger === 'PAYMENT_POSTPONED') return 'POSTPONED';
  if (ledger === 'PAID' || ledger === 'OVERPAID') return 'PAID';
  const paid = Math.max(0, Number(paidAmountKgs || 0));
  const approved = Math.max(0, Number(approvedAmountKgs || 0));
  if (paid > 0.009 && approved > paid + 0.009) return 'PARTIALLY_PAID';
  if (paid > 0.009 && approved <= paid + 0.009) return 'PAID';
  return 'UNPAID';
}

export function getSupplierBillActionVisibility(input: {
  uiStatus: string;
  paidAmount: number;
  remainingAmount: number;
}): SupplierBillActionVisibility {
  return getCargoBillActionVisibility(input);
}

export function isSupplierLedgerAccountantProcessed(
  supplierPaymentStatus?: string | null,
): boolean {
  return isSupplierInvoiceAccountantProcessed({
    supplierPaymentStatus,
  });
}
