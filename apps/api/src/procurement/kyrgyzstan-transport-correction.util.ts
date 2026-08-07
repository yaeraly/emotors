import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';

export const KYRGYZSTAN_TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT = 'RETURNED_TO_ACCOUNTANT';

const ACCOUNTANT_RETURNABLE_STATUSES = new Set<string>([
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
]);

const FORBIDDEN_RETURN_STATUSES = new Set<string>([
  TransportExpenseStatus.PAID,
  TransportExpenseStatus.CANCELLED,
  TransportExpenseStatus.REJECTED,
]);

export function isKyrgyzstanDomesticTransport(expenseType: string): boolean {
  return expenseType === TransportExpenseType.LOCAL_DELIVERY;
}

export function isKyrgyzstanTransportCashierReturned(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return (
    input.status === TransportExpenseStatus.RETURNED &&
    input.executionStatus === KYRGYZSTAN_TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT
  );
}

export function isKyrgyzstanTransportAwaitingSupplyManagerCorrection(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return input.status === TransportExpenseStatus.RETURNED && !input.executionStatus;
}

export function canAccountantReturnKyrgyzstanTransportToSupplyManager(input: {
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
  if (isKyrgyzstanTransportCashierReturned(input)) {
    return true;
  }
  return false;
}

export function buildKyrgyzstanTransportReturnError(input: {
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
  if (isKyrgyzstanTransportAwaitingSupplyManagerCorrection(input)) {
    return 'Расход уже отправлен Supply Manager на исправление.';
  }
  if (input.status === TransportExpenseStatus.PENDING_CASHIER) {
    return 'Расход находится у кассира. Дождитесь возврата от HQ Cashier или отмените отправку в кассу.';
  }
  return 'Расход нельзя вернуть на исправление в текущем статусе.';
}
