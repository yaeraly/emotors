import type { PaymentPartRow } from './sale-payment-parts';
import { createPaymentPartRow } from './sale-payment-parts';
import type { User } from './types';
import { canAcceptSalePayment, isBranchSalesManagerUser } from './rbac';

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const FULL_PAYMENT_UNDERPAYMENT_MESSAGE_KEY =
  'sales.fullPaymentUnderpayment';

export type FullPaymentChangeResult = {
  saleTotal: number;
  receivedAmount: number;
  changeAmount: number;
  isUnderpayment: boolean;
};

export function formatFullPaymentAmount(totalAmount: number) {
  const rounded = roundMoney(totalAmount);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function computeFullPaymentChange(
  saleTotal: number,
  receivedAmount: number,
): FullPaymentChangeResult {
  const total = roundMoney(saleTotal);
  const received = roundMoney(receivedAmount);
  return {
    saleTotal: total,
    receivedAmount: received,
    changeAmount: roundMoney(Math.max(received - total, 0)),
    isUnderpayment: received + 0.009 < total,
  };
}

export function parseFullPaymentReceivedAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return roundMoney(parsed);
}

export function resolveFullPaymentReceivedAmount(rows: PaymentPartRow[]) {
  const row = rows[0];
  if (!row) return 0;
  if (row.method === 'CASH') {
    return parseFullPaymentReceivedAmount(row.cashReceived) ?? 0;
  }
  return parseFullPaymentReceivedAmount(row.amount) ?? 0;
}

export function buildFullPaymentRows(
  totalAmount: number,
  method: PaymentPartRow['method'] = 'CASH',
  receivedAmount?: number,
): PaymentPartRow[] {
  const amount = formatFullPaymentAmount(receivedAmount ?? totalAmount);
  return [
    createPaymentPartRow({
      method,
      amount,
      cashReceived: method === 'CASH' ? amount : '',
    }),
  ];
}

export function syncFullPaymentRowsOnTotalChange(
  rows: PaymentPartRow[],
  totalAmount: number,
  isReceivedAmountManuallyEdited: boolean,
) {
  const method = rows[0]?.method || 'CASH';
  if (!isReceivedAmountManuallyEdited) {
    return buildFullPaymentRows(totalAmount, method);
  }
  const receivedAmount = resolveFullPaymentReceivedAmount(rows);
  const amount = formatFullPaymentAmount(receivedAmount);
  return [
    {
      ...(rows[0] ?? createPaymentPartRow({ method })),
      amount,
      cashReceived: method === 'CASH' ? amount : rows[0]?.cashReceived ?? '',
    },
  ];
}

export function validateFullPaymentReceivedAmount(
  saleTotal: number,
  receivedAmount: number,
): { ok: true; change: FullPaymentChangeResult } | { ok: false; messageKey: string } {
  if (!Number.isFinite(receivedAmount) || receivedAmount < 0) {
    return { ok: false, messageKey: 'sales.paymentAmountPositive' };
  }
  const change = computeFullPaymentChange(saleTotal, receivedAmount);
  if (change.isUnderpayment) {
    return { ok: false, messageKey: FULL_PAYMENT_UNDERPAYMENT_MESSAGE_KEY };
  }
  return { ok: true, change };
}

export function shouldUseBranchCashierFullPaymentFlow(
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined,
) {
  if (!user) return false;
  return isBranchSalesManagerUser(user) && !canAcceptSalePayment(user);
}

export function canFinalizeFullPaymentSale(input: {
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined;
  paymentType: 'FULL_PAYMENT' | 'INSTALLMENT';
  totalAmount: number;
  receivedAmount: number;
  hasBlockingPriceError: boolean;
  hasMissingPricing: boolean;
  paymentValidationOk: boolean;
  paymentComplete: boolean;
}) {
  if (input.paymentType !== 'FULL_PAYMENT') return false;
  if (input.totalAmount <= 0 || input.hasBlockingPriceError || input.hasMissingPricing) {
    return false;
  }
  if (shouldUseBranchCashierFullPaymentFlow(input.user)) {
    return true;
  }
  return input.paymentValidationOk && input.paymentComplete;
}
