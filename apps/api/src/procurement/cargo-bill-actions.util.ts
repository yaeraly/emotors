import { TransportExpenseStatus } from '@prisma/client';
import {
  isExpenseApprovedForLandedCost,
  resolveTransportExpensePaymentStatus,
} from './procurement-cost.util';
import { mapTransportStatusToUi } from './accountant-bills.util';
import {
  PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
} from './payment-request-correction.util';

export type CargoApprovalStatus =
  | 'WAITING_FOR_ACCOUNTANT'
  | 'PROCESSED'
  | 'RETURNED_FOR_CORRECTION';

export type CargoBillUiStatus =
  | 'AWAITING_ACCOUNTANT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PARTIALLY_PAID'
  | 'PAYMENT_POSTPONED'
  | 'FULLY_PAID'
  | 'RETURNED'
  | 'REJECTED'
  | 'CANCELLED';

export type CargoBillActionVisibility = {
  showPayFull: boolean;
  showPayRemainder: boolean;
  showPartial: boolean;
  showPostpone: boolean;
  showChangePostponeDate: boolean;
  showReturnForCorrection: boolean;
  showPaidBanner: boolean;
  showAwaitingCorrectionBanner: boolean;
  showCashierReturnedBanner: boolean;
  showCannotReturnMessage: boolean;
  payFullUsesRemainderLabel: boolean;
  postponeUsesChangeDateLabel: boolean;
};

export function resolveCargoApprovalStatus(
  transportStatus: string | null | undefined,
): CargoApprovalStatus {
  const normalized = String(transportStatus ?? '').toUpperCase();
  if (normalized === TransportExpenseStatus.RETURNED) {
    return 'RETURNED_FOR_CORRECTION';
  }
  if (isExpenseApprovedForLandedCost(normalized)) {
    return 'PROCESSED';
  }
  return 'WAITING_FOR_ACCOUNTANT';
}

export function resolveCargoPaymentStatusLabel(
  transportStatus: string | null | undefined,
  paidAmountKgs?: number | null,
  approvedAmountKgs?: number | null,
): 'UNPAID' | 'PARTIALLY_PAID' | 'POSTPONED' | 'PAID' {
  return resolveTransportExpensePaymentStatus({
    status: transportStatus,
    paidAmountKgs,
    approvedAmountKgs,
  });
}

export function getCargoBillActionVisibility(input: {
  uiStatus: string;
  paidAmount: number;
  remainingAmount: number;
  executionStatus?: string | null;
  hasCashierReturnedRequest?: boolean;
}): CargoBillActionVisibility {
  const status = String(input.uiStatus || '').toUpperCase() as CargoBillUiStatus;
  const paidAmount = Math.max(0, Number(input.paidAmount || 0));
  const remainingAmount = Math.max(0, Number(input.remainingAmount || 0));
  const hasRemaining = remainingAmount > 0.009;
  const hasPaid = paidAmount > 0.009;
  const isCashierReturned =
    input.hasCashierReturnedRequest === true ||
    input.executionStatus === PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS;

  if (isCashierReturned && hasRemaining) {
    return {
      showPayFull: !hasPaid,
      showPayRemainder: hasPaid,
      showPartial: true,
      showPostpone: false,
      showChangePostponeDate: false,
      showReturnForCorrection: !hasPaid,
      showPaidBanner: false,
      showAwaitingCorrectionBanner: false,
      showCashierReturnedBanner: true,
      showCannotReturnMessage: hasPaid,
      payFullUsesRemainderLabel: hasPaid,
      postponeUsesChangeDateLabel: false,
    };
  }

  if (status === 'FULLY_PAID' || status === 'REJECTED' || status === 'CANCELLED') {
    return {
      showPayFull: false,
      showPayRemainder: false,
      showPartial: false,
      showPostpone: false,
      showChangePostponeDate: false,
      showReturnForCorrection: false,
      showPaidBanner: status === 'FULLY_PAID',
      showAwaitingCorrectionBanner: false,
      showCashierReturnedBanner: false,
      showCannotReturnMessage: false,
      payFullUsesRemainderLabel: false,
      postponeUsesChangeDateLabel: false,
    };
  }

  if (status === 'RETURNED') {
    const isReturnedFromCashier = input.executionStatus === PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS;
    const canForwardToSupplyManager = isReturnedFromCashier && !hasPaid;
    return {
      showPayFull: false,
      showPayRemainder: false,
      showPartial: false,
      showPostpone: false,
      showChangePostponeDate: false,
      showReturnForCorrection: canForwardToSupplyManager,
      showPaidBanner: false,
      showAwaitingCorrectionBanner: !canForwardToSupplyManager,
      showCashierReturnedBanner: false,
      showCannotReturnMessage: false,
      payFullUsesRemainderLabel: false,
      postponeUsesChangeDateLabel: false,
    };
  }

  if (status === 'PARTIALLY_PAID') {
    return {
      showPayFull: false,
      showPayRemainder: hasRemaining,
      showPartial: hasRemaining,
      showPostpone: hasRemaining,
      showChangePostponeDate: false,
      showReturnForCorrection: false,
      showPaidBanner: false,
      showAwaitingCorrectionBanner: false,
      showCashierReturnedBanner: false,
      showCannotReturnMessage: hasPaid,
      payFullUsesRemainderLabel: true,
      postponeUsesChangeDateLabel: false,
    };
  }

  if (status === 'PAYMENT_POSTPONED') {
    return {
      showPayFull: hasRemaining,
      showPayRemainder: false,
      showPartial: hasRemaining,
      showPostpone: false,
      showChangePostponeDate: hasRemaining,
      showReturnForCorrection: !hasPaid,
      showPaidBanner: false,
      showAwaitingCorrectionBanner: false,
      showCashierReturnedBanner: false,
      showCannotReturnMessage: hasPaid,
      payFullUsesRemainderLabel: false,
      postponeUsesChangeDateLabel: true,
    };
  }

  if (status === 'APPROVED') {
    return {
      showPayFull: false,
      showPayRemainder: false,
      showPartial: false,
      showPostpone: false,
      showChangePostponeDate: false,
      showReturnForCorrection: false,
      showPaidBanner: false,
      showAwaitingCorrectionBanner: false,
      showCashierReturnedBanner: false,
      showCannotReturnMessage: false,
      payFullUsesRemainderLabel: false,
      postponeUsesChangeDateLabel: false,
    };
  }

  // AWAITING_ACCOUNTANT, UNDER_REVIEW
  return {
    showPayFull: hasRemaining,
    showPayRemainder: false,
    showPartial: hasRemaining,
    showPostpone: hasRemaining,
    showChangePostponeDate: false,
    showReturnForCorrection: !hasPaid,
    showPaidBanner: false,
    showAwaitingCorrectionBanner: false,
    showCashierReturnedBanner: false,
    showCannotReturnMessage: hasPaid,
    payFullUsesRemainderLabel: false,
    postponeUsesChangeDateLabel: false,
  };
}

export function mapTransportExpenseToCargoBillUi(
  transportStatus: string,
): CargoBillUiStatus {
  return mapTransportStatusToUi(transportStatus) as CargoBillUiStatus;
}

export const CARGO_RETURN_BLOCKED_MESSAGE =
  'По счету уже есть платежи. Для изменения суммы используйте корректировку финансового документа.';

export const CARGO_RETURNABLE_STATUSES = new Set<string>([
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
  TransportExpenseStatus.PAYMENT_POSTPONED,
]);
