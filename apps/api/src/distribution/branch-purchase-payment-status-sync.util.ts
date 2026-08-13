import {
  BranchOrderInstallmentStatus,
  BranchPurchaseRequestStatus,
} from '@prisma/client';

export type BranchPurchasePaymentSyncEvent =
  | 'INVOICE_SENT'
  | 'SENT_TO_CASHIER'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_CONFIRMED'
  | 'INSTALLMENT_PENDING'
  | 'INSTALLMENT_APPROVED'
  | 'INSTALLMENT_REJECTED'
  | 'TRANSPORT_COST_ENTERED';

/**
 * Authoritative BPR status transition for invoice/installment payment workflow events.
 * INSTALLMENT_REJECTED must move the linked BPR to REJECTED — never leave AWAITING_PAYMENT.
 */
export function resolveBranchPurchaseRequestStatusForPaymentEvent(
  event: BranchPurchasePaymentSyncEvent,
  installmentStatus?: BranchOrderInstallmentStatus | string | null,
): BranchPurchaseRequestStatus | null {
  switch (event) {
    case 'INVOICE_SENT':
    case 'SENT_TO_CASHIER':
      return BranchPurchaseRequestStatus.PENDING_PAYMENT;
    case 'PAYMENT_SUBMITTED':
      return BranchPurchaseRequestStatus.PAYMENT_SUBMITTED;
    case 'PAYMENT_REJECTED':
      return BranchPurchaseRequestStatus.PAYMENT_REJECTED;
    case 'PAYMENT_CONFIRMED':
      if (installmentStatus === BranchOrderInstallmentStatus.APPROVED || installmentStatus === 'APPROVED') {
        return null;
      }
      if (installmentStatus === BranchOrderInstallmentStatus.PENDING || installmentStatus === 'PENDING') {
        return BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL;
      }
      if (!installmentStatus) {
        return BranchPurchaseRequestStatus.PAYMENT_CONFIRMED;
      }
      return null;
    case 'INSTALLMENT_PENDING':
      return BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL;
    case 'INSTALLMENT_APPROVED':
      return null;
    case 'INSTALLMENT_REJECTED':
      return BranchPurchaseRequestStatus.REJECTED;
    case 'TRANSPORT_COST_ENTERED':
      return BranchPurchaseRequestStatus.COMPLETED;
    default:
      return null;
  }
}

/** Repair helper: stale BPR not yet REJECTED while HQ CEO installment decision is REJECTED. */
export function shouldRepairBprStatusForRejectedInstallment(input: {
  bprStatus: BranchPurchaseRequestStatus | string;
  installmentStatus?: BranchOrderInstallmentStatus | string | null;
}): boolean {
  const installmentRejected =
    input.installmentStatus === BranchOrderInstallmentStatus.REJECTED ||
    input.installmentStatus === 'REJECTED';
  if (!installmentRejected) return false;

  if (
    input.bprStatus === BranchPurchaseRequestStatus.REJECTED ||
    input.bprStatus === 'REJECTED' ||
    input.bprStatus === BranchPurchaseRequestStatus.CANCELLED ||
    input.bprStatus === 'CANCELLED' ||
    input.bprStatus === BranchPurchaseRequestStatus.COMPLETED ||
    input.bprStatus === 'COMPLETED'
  ) {
    return false;
  }

  return true;
}
