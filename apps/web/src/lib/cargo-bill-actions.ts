export const CARGO_RETURN_BLOCKED_MESSAGE =
  'По счету уже есть платежи. Для изменения суммы используйте корректировку финансового документа.';

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

/** Prefer KGS remaining; fall back to source-currency remaining when KGS is 0/missing. */
export function resolveBillRemainingForActions(input: {
  remainingAmountKgs?: number | null;
  remainingAmount?: number | null;
}): number {
  const kgs = Number(input.remainingAmountKgs);
  if (Number.isFinite(kgs) && kgs > 0.009) return kgs;
  const amount = Number(input.remainingAmount);
  if (Number.isFinite(amount) && amount > 0.009) return amount;
  return Math.max(0, Number.isFinite(kgs) ? kgs : 0);
}

export function getCargoBillActionVisibility(input: {
  uiStatus: string;
  paidAmount: number;
  remainingAmount: number;
  executionStatus?: string | null;
  hasCashierReturnedRequest?: boolean;
}): CargoBillActionVisibility {
  const status = String(input.uiStatus || '').toUpperCase();
  const paidAmount = Math.max(0, Number(input.paidAmount || 0));
  const remainingAmount = Math.max(0, Number(input.remainingAmount || 0));
  const hasRemaining = remainingAmount > 0.009;
  const hasPaid = paidAmount > 0.009;
  const isCashierReturned =
    input.hasCashierReturnedRequest === true ||
    input.executionStatus === 'RETURNED_TO_ACCOUNTANT';

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
    const canForwardToSupplyManager = isCashierReturned && !hasPaid;
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
