import {
  BranchInstallmentEarlyPaymentStatus,
  BranchInstallmentEarlyPaymentType,
} from '@prisma/client';
import { roundBranchOrderMoney } from './branch-order-installment.util';

export const ACTIVE_EARLY_PAYMENT_STATUSES: BranchInstallmentEarlyPaymentStatus[] = [
  BranchInstallmentEarlyPaymentStatus.PENDING_BRANCH_CEO_APPROVAL,
  BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
  BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER,
  BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED,
];

export const CASHIER_VISIBLE_EARLY_PAYMENT_STATUSES: BranchInstallmentEarlyPaymentStatus[] = [
  BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER,
  BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED,
];

export function validateEarlyPaymentAmount(
  paymentType: BranchInstallmentEarlyPaymentType,
  requestedAmount: number,
  remainingDebt: number,
) {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return 'AMOUNT_REQUIRED';
  }
  if (requestedAmount > remainingDebt + 0.009) {
    return 'AMOUNT_EXCEEDS_DEBT';
  }
  if (paymentType === BranchInstallmentEarlyPaymentType.FULL) {
    if (Math.abs(requestedAmount - remainingDebt) > 0.009) {
      return 'FULL_PAYMENT_AMOUNT_MISMATCH';
    }
  }
  return null;
}

export function resolveEarlyPaymentApprovedAmount(
  paymentType: BranchInstallmentEarlyPaymentType,
  requestedAmount: number,
  remainingDebt: number,
) {
  if (paymentType === BranchInstallmentEarlyPaymentType.FULL) {
    return roundBranchOrderMoney(remainingDebt);
  }
  return roundBranchOrderMoney(requestedAmount);
}

export function canSendEarlyPaymentToCashier(status: BranchInstallmentEarlyPaymentStatus) {
  return status === BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO;
}

export function isEarlyPaymentSentToCashier(status: BranchInstallmentEarlyPaymentStatus) {
  return (
    status === BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER ||
    status === BranchInstallmentEarlyPaymentStatus.PAYMENT_SUBMITTED
  );
}
