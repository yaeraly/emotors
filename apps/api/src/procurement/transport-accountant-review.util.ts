import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';

export const TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT = 'RETURNED_TO_ACCOUNTANT';

export function isDomesticTransportExpenseType(expenseType: string): boolean {
  return (
    expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT ||
    expenseType === TransportExpenseType.LOCAL_DELIVERY
  );
}

export function isTransportCashierReturnedToAccountant(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return (
    input.status === TransportExpenseStatus.RETURNED &&
    input.executionStatus === TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT
  );
}

export function isTransportAccountantReviewAfterCashierReturn(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return (
    input.status === TransportExpenseStatus.UNDER_REVIEW &&
    input.executionStatus === TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT
  );
}

export function resolveTransportCashierReturnReason(input: {
  status: string;
  executionStatus?: string | null;
  returnReason?: string | null;
}): string | null {
  if (
    isTransportCashierReturnedToAccountant(input) ||
    isTransportAccountantReviewAfterCashierReturn(input)
  ) {
    const reason = String(input.returnReason ?? '').trim();
    return reason || null;
  }
  return null;
}

export function canTakeTransportForAccountantReview(input: {
  expenseType: string;
  status: string;
  executionStatus?: string | null;
  accountantId?: string | null;
  actorUserId: string;
}): boolean {
  if (
    isDomesticTransportExpenseType(input.expenseType) &&
    isTransportCashierReturnedToAccountant(input)
  ) {
    return true;
  }
  if (input.status === TransportExpenseStatus.WAITING_ACCOUNTANT) {
    return true;
  }
  if (input.status === TransportExpenseStatus.UNDER_REVIEW) {
    return !input.accountantId || input.accountantId === input.actorUserId;
  }
  return false;
}

export function canAccountantDecideOnTransportReview(input: {
  status: string;
  accountantId?: string | null;
  actorUserId: string;
}): boolean {
  if (input.status !== TransportExpenseStatus.UNDER_REVIEW) {
    return false;
  }
  return Boolean(input.accountantId && input.accountantId === input.actorUserId);
}

export function canApproveTransportInAccountantReview(input: {
  expenseType: string;
  status: string;
  executionStatus?: string | null;
  accountantId?: string | null;
  actorUserId: string;
}): boolean {
  if (
    isDomesticTransportExpenseType(input.expenseType) &&
    (isTransportCashierReturnedToAccountant(input) ||
      isTransportAccountantReviewAfterCashierReturn(input))
  ) {
    return canAccountantDecideOnTransportReview(input);
  }
  return (
    [
      TransportExpenseStatus.WAITING_ACCOUNTANT,
      TransportExpenseStatus.UNDER_REVIEW,
      TransportExpenseStatus.PAYMENT_POSTPONED,
    ] as string[]
  ).includes(input.status);
}

export function canAccountantReturnDomesticTransportDuringReview(input: {
  expenseType: string;
  status: string;
  executionStatus?: string | null;
  accountantId?: string | null;
  actorUserId: string;
  paidAmountKgs?: number;
}): boolean {
  if (!isDomesticTransportExpenseType(input.expenseType)) {
    return false;
  }
  if (isTransportCashierReturnedToAccountant(input)) {
    return false;
  }
  if (
    isTransportAccountantReviewAfterCashierReturn(input) &&
    !canAccountantDecideOnTransportReview(input)
  ) {
    return false;
  }
  if (input.status === TransportExpenseStatus.WAITING_ACCOUNTANT) {
    return !(Number(input.paidAmountKgs || 0) > 0.009);
  }
  if (canAccountantDecideOnTransportReview(input)) {
    return !(Number(input.paidAmountKgs || 0) > 0.009);
  }
  return false;
}

export function canAccountantRejectDomesticTransportDuringReview(input: {
  expenseType: string;
  status: string;
  executionStatus?: string | null;
  accountantId?: string | null;
  actorUserId: string;
  paidAmountKgs?: number;
}): boolean {
  return canAccountantReturnDomesticTransportDuringReview(input);
}

export function buildTransportReviewAssignmentError(input: {
  status: string;
  accountantId?: string | null;
  actorUserId: string;
}): string {
  if (
    input.status === TransportExpenseStatus.UNDER_REVIEW &&
    input.accountantId &&
    input.accountantId !== input.actorUserId
  ) {
    return 'Счёт уже взят на проверку другим бухгалтером.';
  }
  return 'Счёт нельзя взять на проверку в текущем статусе.';
}
