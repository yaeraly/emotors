import type { BranchPaymentMethod } from '@/lib/types';

export const BRANCH_CASHIER_INVOICE_PAYMENT_METHODS: BranchPaymentMethod[] = [
  'CASH',
  'QR',
  'BANK',
];

export const BRANCH_MULTI_METHOD_PAYMENT_ERRORS = {
  NO_METHOD_AMOUNT: 'Введите сумму хотя бы для одного способа оплаты.',
  FULL_PAYMENT_UNDER: 'Общая сумма платежа меньше суммы счета.',
  INSTALLMENT_OVER: 'Сумма погашения превышает остаток рассрочки.',
  NON_CASH_OVER_PAYABLE: 'Сумма безналичной оплаты не может превышать сумму к оплате.',
  DUPLICATE_METHOD: 'Способ оплаты уже добавлен.',
} as const;

export type PaymentMethodRow = {
  id: string;
  method: BranchPaymentMethod;
  amount: string;
};

export type ResolvedMethodAllocationPreview = {
  method: BranchPaymentMethod;
  grossAmount: number;
  netAmount: number;
  changeAmount: number;
};

export type MultiMethodPaymentPreview = {
  allocations: ResolvedMethodAllocationPreview[];
  cashChangeAmount: number;
  totalEntered: number;
  totalNetAmount: number;
  remainingAfterPayment: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parsePaymentAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return roundMoney(parsed);
}

export function createPaymentMethodRow(
  method: BranchPaymentMethod = 'CASH',
  amount = '0',
): PaymentMethodRow {
  return {
    id: crypto.randomUUID(),
    method,
    amount,
  };
}

export function createInitialPaymentRows(): PaymentMethodRow[] {
  return [createPaymentMethodRow('CASH', '0')];
}

export function availablePaymentMethods(
  rows: PaymentMethodRow[],
  currentMethod?: BranchPaymentMethod,
): BranchPaymentMethod[] {
  const used = new Set(rows.map((row) => row.method));
  if (currentMethod) used.delete(currentMethod);
  return BRANCH_CASHIER_INVOICE_PAYMENT_METHODS.filter((method) => !used.has(method));
}

export function canAddPaymentMethod(rows: PaymentMethodRow[]) {
  return availablePaymentMethods(rows).length > 0;
}

export function addPaymentMethodRow(rows: PaymentMethodRow[]): PaymentMethodRow[] {
  const nextMethod = availablePaymentMethods(rows)[0];
  if (!nextMethod) return rows;
  return [...rows, createPaymentMethodRow(nextMethod, '0')];
}

export function removePaymentMethodRow(rows: PaymentMethodRow[], rowId: string) {
  if (rows.length <= 1) return rows;
  return rows.filter((row) => row.id !== rowId);
}

export function previewMultiMethodCashierPayment(input: {
  payableAmount: number;
  isFullPayment: boolean;
  rows: PaymentMethodRow[];
}): MultiMethodPaymentPreview | { error: string } {
  const payableAmount = roundMoney(input.payableAmount);
  const normalized = input.rows
    .map((row) => ({
      method: row.method,
      grossAmount: parsePaymentAmount(row.amount),
    }))
    .filter((row) => row.grossAmount > 0);

  if (!normalized.length) {
    return { error: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NO_METHOD_AMOUNT };
  }

  const methods = normalized.map((row) => row.method);
  if (new Set(methods).size !== methods.length) {
    return { error: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.DUPLICATE_METHOD };
  }

  const cashGrossAmount = roundMoney(
    normalized.find((row) => row.method === 'CASH')?.grossAmount ?? 0,
  );
  const nonCashRows = normalized.filter((row) => row.method !== 'CASH');
  const nonCashGrossTotal = roundMoney(
    nonCashRows.reduce((sum, row) => sum + row.grossAmount, 0),
  );
  const totalEntered = roundMoney(cashGrossAmount + nonCashGrossTotal);

  if (nonCashGrossTotal > payableAmount + 0.009) {
    return { error: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NON_CASH_OVER_PAYABLE };
  }

  const nonCashAllocations: ResolvedMethodAllocationPreview[] = nonCashRows.map((row) => ({
    method: row.method,
    grossAmount: row.grossAmount,
    netAmount: row.grossAmount,
    changeAmount: 0,
  }));

  let cashChangeAmount = 0;
  let cashNetAmount = 0;

  if (input.isFullPayment) {
    if (totalEntered + 0.009 < payableAmount) {
      return { error: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.FULL_PAYMENT_UNDER };
    }
    const cashRequired = roundMoney(Math.max(payableAmount - nonCashGrossTotal, 0));
    cashChangeAmount = roundMoney(Math.max(cashGrossAmount - cashRequired, 0));
    cashNetAmount = roundMoney(cashGrossAmount - cashChangeAmount);
  } else if (totalEntered > payableAmount + 0.009) {
    cashNetAmount = roundMoney(Math.max(payableAmount - nonCashGrossTotal, 0));
    cashChangeAmount = roundMoney(Math.max(cashGrossAmount - cashNetAmount, 0));
  } else {
    cashNetAmount = cashGrossAmount;
  }

  const allocations: ResolvedMethodAllocationPreview[] = [...nonCashAllocations];
  if (cashGrossAmount > 0) {
    allocations.push({
      method: 'CASH',
      grossAmount: cashGrossAmount,
      netAmount: cashNetAmount,
      changeAmount: cashChangeAmount,
    });
  }

  const totalNetAmount = roundMoney(allocations.reduce((sum, row) => sum + row.netAmount, 0));
  const remainingAfterPayment = roundMoney(Math.max(payableAmount - totalNetAmount, 0));

  if (!input.isFullPayment && totalNetAmount > payableAmount + 0.009) {
    return { error: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.INSTALLMENT_OVER };
  }

  if (input.isFullPayment && Math.abs(totalNetAmount - payableAmount) > 0.009) {
    return { error: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.FULL_PAYMENT_UNDER };
  }

  return {
    allocations,
    cashChangeAmount,
    totalEntered,
    totalNetAmount,
    remainingAfterPayment,
  };
}

export function computePaymentRemaining(payableAmount: number, totalEntered: number) {
  return roundMoney(Math.max(payableAmount - totalEntered, 0));
}

export function buildPaymentAllocationsPayload(
  rows: PaymentMethodRow[],
  accountIds: Partial<Record<BranchPaymentMethod, string>>,
) {
  return rows
    .map((row) => ({
      method: row.method,
      amount: parsePaymentAmount(row.amount),
      accountId: accountIds[row.method],
    }))
    .filter((row) => row.amount > 0);
}
