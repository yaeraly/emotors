import { ProcurementSupplierPaymentStatus } from '@prisma/client';
import { TransportExpenseStatus } from '@prisma/client';

export const PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS = 'RETURNED_TO_ACCOUNTANT';

export const PAYMENT_REQUEST_AMOUNT_REQUIRED_MESSAGE = 'Введите сумму платежа.';
export const PAYMENT_REQUEST_EXCEEDS_REMAINING_MESSAGE =
  'Сумма платежа превышает текущий остаток.';
export const PAYMENT_REQUEST_ALREADY_POSTED_MESSAGE =
  'Этот платеж уже проведён кассиром и не может быть изменён.';
export const PAYMENT_REQUEST_ALREADY_UPDATED_MESSAGE = 'Запрос на оплату уже был обновлён.';

export type CashierReturnedPaymentRequestContext = {
  paymentId?: string;
  executionStatus: typeof PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS;
  returnReason: string | null;
  requestedAmountKgs: number;
  requestedAmountCny: number | null;
  exchangeRateCnyKgs: number | null;
  returnedAt: string | null;
};

export function resolveLatestCashierReturnedSupplierPaymentRequest(
  payments: Array<{
    id?: string;
    status?: string | null;
    executionStatus?: string | null;
    returnReason?: string | null;
    amountYuan?: number | string | null;
    amountKgs?: number | string | null;
    approvedAmountKgs?: number | string | null;
    exchangeRate?: number | string | null;
    returnedAt?: Date | string | null;
    createdAt?: Date | string | null;
  }>,
): CashierReturnedPaymentRequestContext | null {
  const returned = payments
    .filter(
      (payment) =>
        String(payment.status ?? '').toUpperCase() ===
          ProcurementSupplierPaymentStatus.RETURNED &&
        payment.executionStatus === PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
    )
    .sort((left, right) => {
      const leftTime = new Date(left.returnedAt ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.returnedAt ?? right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    });
  const latest = returned[0];
  if (!latest) return null;
  const requestedAmountKgs = Number(
    latest.approvedAmountKgs ?? latest.amountKgs ?? 0,
  );
  if (!(requestedAmountKgs > 0)) return null;
  const exchangeRate = Number(latest.exchangeRate || 0);
  return {
    paymentId: latest.id,
    executionStatus: PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
    returnReason: latest.returnReason?.trim() || null,
    requestedAmountKgs,
    requestedAmountCny: Number(latest.amountYuan || 0) > 0 ? Number(latest.amountYuan) : null,
    exchangeRateCnyKgs: exchangeRate > 0 ? exchangeRate : null,
    returnedAt: latest.returnedAt ? new Date(latest.returnedAt).toISOString() : null,
  };
}

export function resolveCargoCashierReturnedPaymentRequest(input: {
  status: string;
  executionStatus?: string | null;
  returnReason?: string | null;
  cashierInstructionAmountKgs?: number | string | null;
  returnedAt?: Date | string | null;
}): CashierReturnedPaymentRequestContext | null {
  if (
    input.status !== TransportExpenseStatus.RETURNED ||
    input.executionStatus !== PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS
  ) {
    return null;
  }
  const requestedAmountKgs = Number(input.cashierInstructionAmountKgs || 0);
  if (!(requestedAmountKgs > 0)) return null;
  return {
    executionStatus: PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
    returnReason: input.returnReason?.trim() || null,
    requestedAmountKgs,
    requestedAmountCny: null,
    exchangeRateCnyKgs: null,
    returnedAt: input.returnedAt ? new Date(input.returnedAt).toISOString() : null,
  };
}

export function hasCashierReturnedPaymentRequest(input: {
  executionStatus?: string | null;
  cashierReturnedPaymentRequest?: CashierReturnedPaymentRequestContext | null;
}): boolean {
  return (
    input.cashierReturnedPaymentRequest != null ||
    input.executionStatus === PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS
  );
}
