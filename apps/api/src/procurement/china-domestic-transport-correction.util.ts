import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';

export const CHINA_DOMESTIC_TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT = 'RETURNED_TO_ACCOUNTANT';

const ACCOUNTANT_RETURNABLE_STATUSES = new Set<string>([
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
]);

const FORBIDDEN_RETURN_STATUSES = new Set<string>([
  TransportExpenseStatus.PAID,
  TransportExpenseStatus.CANCELLED,
  TransportExpenseStatus.REJECTED,
]);

export function isChinaDomesticTransport(expenseType: string): boolean {
  return expenseType === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT;
}

export function isChinaDomesticTransportCashierReturned(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return (
    input.status === TransportExpenseStatus.RETURNED &&
    input.executionStatus === CHINA_DOMESTIC_TRANSPORT_EXECUTION_RETURNED_TO_ACCOUNTANT
  );
}

export function isChinaDomesticTransportAwaitingSupplyManagerCorrection(input: {
  status: string;
  executionStatus?: string | null;
}): boolean {
  return input.status === TransportExpenseStatus.RETURNED && !input.executionStatus;
}

export function canAccountantReturnChinaDomesticTransportToSupplyManager(input: {
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
  return false;
}

export function buildChinaDomesticTransportReturnError(input: {
  status: string;
  executionStatus?: string | null;
  paidAmountKgs?: number;
}): string {
  if (input.status === TransportExpenseStatus.PAID) {
    return 'Счёт уже полностью оплачен и не может быть возвращён обычным способом.';
  }
  if (input.status === TransportExpenseStatus.CANCELLED) {
    return 'Счёт закрыт.';
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
  if (isChinaDomesticTransportAwaitingSupplyManagerCorrection(input)) {
    return 'Счёт уже отправлен Supply Manager на исправление.';
  }
  if (input.status === TransportExpenseStatus.PENDING_CASHIER) {
    return 'Расход находится у кассира. Дождитесь возврата от HQ Cashier или отмените отправку в кассу.';
  }
  return 'Расход нельзя вернуть на исправление в текущем статусе.';
}
