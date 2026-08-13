import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';

export const CARGO_PAYMENT_EXECUTION_RETURNED_TO_ACCOUNTANT = 'RETURNED_TO_ACCOUNTANT';

const ACCOUNTANT_RETURNABLE_STATUSES = new Set<string>([
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
  TransportExpenseStatus.PAYMENT_POSTPONED,
  TransportExpenseStatus.PENDING_CASHIER,
]);

const FORBIDDEN_RETURN_STATUSES = new Set<string>([
  TransportExpenseStatus.PAID,
  TransportExpenseStatus.CANCELLED,
  TransportExpenseStatus.REJECTED,
]);

export function isCargoPaymentExpense(expenseType: string): boolean {
  return expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT;
}

export function isCargoPaymentCashierReturned(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return (
    input.status === TransportExpenseStatus.RETURNED &&
    input.executionStatus === CARGO_PAYMENT_EXECUTION_RETURNED_TO_ACCOUNTANT
  );
}

export function isCargoPaymentAwaitingSupplyManagerCorrection(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return input.status === TransportExpenseStatus.RETURNED && !input.executionStatus;
}

export function canAccountantReturnCargoToSupplyManager(input: {
  status: string;
  executionStatus?: string | null;
  paidAmountKgs?: number;
}): boolean {
  if (FORBIDDEN_RETURN_STATUSES.has(input.status)) {
    return false;
  }
  if (input.status === TransportExpenseStatus.PARTIALLY_PAID) {
    return false;
  }
  if (Number(input.paidAmountKgs || 0) > 0.009) {
    return false;
  }
  if (ACCOUNTANT_RETURNABLE_STATUSES.has(input.status)) {
    return true;
  }
  if (isCargoPaymentCashierReturned(input)) {
    return true;
  }
  return false;
}

export function buildCargoPaymentReturnError(input: {
  status: string;
  executionStatus?: string | null;
  paidAmountKgs?: number;
}): string {
  if (input.status === TransportExpenseStatus.PAID) {
    return 'Этот расход уже оплачен и не может быть возвращён через обычное исправление.';
  }
  if (input.status === TransportExpenseStatus.CANCELLED) {
    return 'Расход уже закрыт.';
  }
  if (input.status === TransportExpenseStatus.REJECTED) {
    return 'Расход отклонён и не может быть возвращён на исправление.';
  }
  if (
    input.status === TransportExpenseStatus.PARTIALLY_PAID ||
    Number(input.paidAmountKgs || 0) > 0.009
  ) {
    return 'По счету уже есть платежи. Для изменения суммы используйте корректировку финансового документа.';
  }
  if (isCargoPaymentAwaitingSupplyManagerCorrection(input)) {
    return 'Расход уже отправлен Supply Manager на исправление.';
  }
  if (input.status === TransportExpenseStatus.PENDING_CASHIER && !isCargoPaymentCashierReturned(input)) {
    return 'Расход находится у кассира. Дождитесь возврата от HQ Cashier или отмените отправку в кассу.';
  }
  return 'Расход нельзя вернуть на исправление в текущем статусе.';
}
