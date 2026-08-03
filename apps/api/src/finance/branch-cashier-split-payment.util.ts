import { BadRequestException } from '@nestjs/common';
import { BranchPaymentMethod } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export const BRANCH_CASHIER_INVOICE_PAYMENT_METHODS = [
  BranchPaymentMethod.CASH,
  BranchPaymentMethod.QR,
  BranchPaymentMethod.BANK,
] as const;

export type BranchCashierInvoicePaymentMethod =
  (typeof BRANCH_CASHIER_INVOICE_PAYMENT_METHODS)[number];

export const BRANCH_MULTI_METHOD_PAYMENT_AUDIT = {
  MULTI_METHOD_PAYMENT_CONFIRMED: 'BRANCH_MULTI_METHOD_PAYMENT_CONFIRMED',
  ALLOCATION_CREATED: 'BRANCH_PAYMENT_ALLOCATION_CREATED',
  CASH_PAYMENT_POSTED: 'BRANCH_CASH_PAYMENT_POSTED',
  QR_PAYMENT_POSTED: 'BRANCH_QR_PAYMENT_POSTED',
  BANK_PAYMENT_POSTED: 'BRANCH_BANK_PAYMENT_POSTED',
  INVOICE_PAID: 'BRANCH_INVOICE_PAID',
  INSTALLMENT_PAYMENT_RECEIVED: 'BRANCH_INSTALLMENT_PAYMENT_RECEIVED',
} as const;

/** @deprecated Use BRANCH_MULTI_METHOD_PAYMENT_AUDIT */
export const BRANCH_SPLIT_PAYMENT_AUDIT = {
  SPLIT_PAYMENT_CONFIRMED: BRANCH_MULTI_METHOD_PAYMENT_AUDIT.MULTI_METHOD_PAYMENT_CONFIRMED,
  CASH_PAYMENT_POSTED: BRANCH_MULTI_METHOD_PAYMENT_AUDIT.CASH_PAYMENT_POSTED,
  QR_PAYMENT_POSTED: BRANCH_MULTI_METHOD_PAYMENT_AUDIT.QR_PAYMENT_POSTED,
  INVOICE_PAID: BRANCH_MULTI_METHOD_PAYMENT_AUDIT.INVOICE_PAID,
  INSTALLMENT_PAYMENT_RECEIVED: BRANCH_MULTI_METHOD_PAYMENT_AUDIT.INSTALLMENT_PAYMENT_RECEIVED,
} as const;

export const BRANCH_MULTI_METHOD_PAYMENT_ERRORS = {
  NO_METHOD_AMOUNT: 'Введите сумму хотя бы для одного способа оплаты.',
  FULL_PAYMENT_UNDER: 'Общая сумма платежа меньше суммы счета.',
  INSTALLMENT_OVER: 'Сумма погашения превышает остаток рассрочки.',
  NON_CASH_OVER_PAYABLE: 'Сумма безналичной оплаты не может превышать сумму к оплате.',
  DUPLICATE_METHOD: 'Способ оплаты уже добавлен.',
  UNSUPPORTED_METHOD: 'Неподдерживаемый способ оплаты.',
} as const;

/** @deprecated Use BRANCH_MULTI_METHOD_PAYMENT_ERRORS */
export const BRANCH_SPLIT_PAYMENT_ERRORS = {
  NO_METHOD_AMOUNT: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NO_METHOD_AMOUNT,
  FULL_PAYMENT_UNDER: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.FULL_PAYMENT_UNDER,
  INSTALLMENT_OVER: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.INSTALLMENT_OVER,
  QR_OVER_PAYABLE: BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NON_CASH_OVER_PAYABLE,
} as const;

export type MethodAllocationInput = {
  method: string;
  grossAmount: number;
};

export type ResolvedMethodAllocation = {
  method: string;
  grossAmount: number;
  netAmount: number;
  changeAmount: number;
};

export type MultiMethodPaymentResult = {
  allocations: ResolvedMethodAllocation[];
  cashChangeAmount: number;
  totalEntered: number;
  totalNetAmount: number;
  remainingAfterPayment: number;
  cashGrossAmount: number;
  qrGrossAmount: number;
  cashNetAmount: number;
  qrNetAmount: number;
};

/** @deprecated Use MultiMethodPaymentResult */
export type SplitPaymentAllocation = MultiMethodPaymentResult;

export function isCashPaymentMethod(method: string) {
  return method === BranchPaymentMethod.CASH;
}

export function allocationPostedAuditAction(method: string) {
  switch (method) {
    case BranchPaymentMethod.CASH:
      return BRANCH_MULTI_METHOD_PAYMENT_AUDIT.CASH_PAYMENT_POSTED;
    case BranchPaymentMethod.QR:
      return BRANCH_MULTI_METHOD_PAYMENT_AUDIT.QR_PAYMENT_POSTED;
    case BranchPaymentMethod.BANK:
    case BranchPaymentMethod.TRANSFER:
      return BRANCH_MULTI_METHOD_PAYMENT_AUDIT.BANK_PAYMENT_POSTED;
    default:
      return BRANCH_MULTI_METHOD_PAYMENT_AUDIT.ALLOCATION_CREATED;
  }
}

export function isSupportedCashierInvoicePaymentMethod(method: string): method is BranchCashierInvoicePaymentMethod {
  return (BRANCH_CASHIER_INVOICE_PAYMENT_METHODS as readonly string[]).includes(method);
}

export function isMultiMethodCashierPaymentInput(input: {
  allocations?: Array<{ method?: string | null; amount?: number | null }> | null;
  cashAmount?: number | null;
  qrAmount?: number | null;
}) {
  if (input.allocations?.some((row) => roundDisplayMoney(Number(row.amount ?? 0)) > 0)) {
    return true;
  }
  return (
    roundDisplayMoney(Number(input.cashAmount ?? 0)) > 0 ||
    roundDisplayMoney(Number(input.qrAmount ?? 0)) > 0
  );
}

/** @deprecated Use isMultiMethodCashierPaymentInput */
export const isSplitCashierPaymentInput = isMultiMethodCashierPaymentInput;

export function normalizeCashierPaymentAllocations(input: {
  allocations?: Array<{
    method?: string | null;
    amount?: number | null;
    accountId?: string | null;
  }> | null;
  cashAmount?: number | null;
  qrAmount?: number | null;
  cashAccountId?: string | null;
  qrAccountId?: string | null;
}): Array<{ method: string; grossAmount: number; accountId?: string | null }> {
  if (input.allocations?.length) {
    return input.allocations
      .map((row) => ({
        method: String(row.method ?? '').trim(),
        grossAmount: roundDisplayMoney(Number(row.amount ?? 0)),
        accountId: row.accountId ?? null,
      }))
      .filter((row) => row.method && row.grossAmount > 0);
  }

  const legacy: Array<{ method: string; grossAmount: number; accountId?: string | null }> = [];
  const cashAmount = roundDisplayMoney(Number(input.cashAmount ?? 0));
  const qrAmount = roundDisplayMoney(Number(input.qrAmount ?? 0));
  if (cashAmount > 0) {
    legacy.push({
      method: BranchPaymentMethod.CASH,
      grossAmount: cashAmount,
      accountId: input.cashAccountId ?? null,
    });
  }
  if (qrAmount > 0) {
    legacy.push({
      method: BranchPaymentMethod.QR,
      grossAmount: qrAmount,
      accountId: input.qrAccountId ?? null,
    });
  }
  return legacy;
}

export function resolveMultiMethodCashierPayment(input: {
  payableAmount: number;
  isFullPayment: boolean;
  allocations: MethodAllocationInput[];
}): MultiMethodPaymentResult {
  const payableAmount = roundDisplayMoney(input.payableAmount);
  const normalized = input.allocations
    .map((row) => ({
      method: row.method,
      grossAmount: roundDisplayMoney(row.grossAmount),
    }))
    .filter((row) => row.grossAmount > 0);

  if (!normalized.length) {
    throw new BadRequestException(BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NO_METHOD_AMOUNT);
  }

  const methods = normalized.map((row) => row.method);
  if (new Set(methods).size !== methods.length) {
    throw new BadRequestException(BRANCH_MULTI_METHOD_PAYMENT_ERRORS.DUPLICATE_METHOD);
  }

  for (const method of methods) {
    if (!isSupportedCashierInvoicePaymentMethod(method)) {
      throw new BadRequestException(BRANCH_MULTI_METHOD_PAYMENT_ERRORS.UNSUPPORTED_METHOD);
    }
  }

  const cashGrossAmount = roundDisplayMoney(
    normalized.find((row) => isCashPaymentMethod(row.method))?.grossAmount ?? 0,
  );
  const nonCashRows = normalized.filter((row) => !isCashPaymentMethod(row.method));
  const nonCashGrossTotal = roundDisplayMoney(
    nonCashRows.reduce((sum, row) => sum + row.grossAmount, 0),
  );
  const totalEntered = roundDisplayMoney(cashGrossAmount + nonCashGrossTotal);

  if (nonCashGrossTotal > payableAmount + 0.009) {
    throw new BadRequestException(BRANCH_MULTI_METHOD_PAYMENT_ERRORS.NON_CASH_OVER_PAYABLE);
  }

  const nonCashAllocations: ResolvedMethodAllocation[] = nonCashRows.map((row) => ({
    method: row.method,
    grossAmount: row.grossAmount,
    netAmount: row.grossAmount,
    changeAmount: 0,
  }));

  let cashChangeAmount = 0;
  let cashNetAmount = 0;

  if (input.isFullPayment) {
    if (totalEntered + 0.009 < payableAmount) {
      throw new BadRequestException(BRANCH_MULTI_METHOD_PAYMENT_ERRORS.FULL_PAYMENT_UNDER);
    }
    const cashRequired = roundDisplayMoney(Math.max(payableAmount - nonCashGrossTotal, 0));
    cashChangeAmount = roundDisplayMoney(Math.max(cashGrossAmount - cashRequired, 0));
    cashNetAmount = roundDisplayMoney(cashGrossAmount - cashChangeAmount);
  } else if (totalEntered > payableAmount + 0.009) {
    cashNetAmount = roundDisplayMoney(Math.max(payableAmount - nonCashGrossTotal, 0));
    cashChangeAmount = roundDisplayMoney(Math.max(cashGrossAmount - cashNetAmount, 0));
  } else {
    cashNetAmount = cashGrossAmount;
  }

  const allocations: ResolvedMethodAllocation[] = [...nonCashAllocations];
  if (cashGrossAmount > 0) {
    allocations.push({
      method: BranchPaymentMethod.CASH,
      grossAmount: cashGrossAmount,
      netAmount: cashNetAmount,
      changeAmount: cashChangeAmount,
    });
  }

  const totalNetAmount = roundDisplayMoney(
    allocations.reduce((sum, row) => sum + row.netAmount, 0),
  );
  const remainingAfterPayment = roundDisplayMoney(Math.max(payableAmount - totalNetAmount, 0));

  if (!input.isFullPayment && totalNetAmount > payableAmount + 0.009) {
    throw new BadRequestException(BRANCH_MULTI_METHOD_PAYMENT_ERRORS.INSTALLMENT_OVER);
  }

  if (input.isFullPayment && Math.abs(totalNetAmount - payableAmount) > 0.009) {
    throw new BadRequestException(BRANCH_MULTI_METHOD_PAYMENT_ERRORS.FULL_PAYMENT_UNDER);
  }

  const qrGrossAmount = roundDisplayMoney(
    normalized.find((row) => row.method === BranchPaymentMethod.QR)?.grossAmount ?? 0,
  );
  const qrNetAmount = roundDisplayMoney(
    allocations.find((row) => row.method === BranchPaymentMethod.QR)?.netAmount ?? 0,
  );

  return {
    allocations,
    cashChangeAmount,
    totalEntered,
    totalNetAmount,
    remainingAfterPayment,
    cashGrossAmount,
    qrGrossAmount,
    cashNetAmount,
    qrNetAmount,
  };
}

export function resolveSplitCashierPayment(input: {
  payableAmount: number;
  isFullPayment: boolean;
  cashGrossAmount: number;
  qrGrossAmount: number;
}): MultiMethodPaymentResult {
  return resolveMultiMethodCashierPayment({
    payableAmount: input.payableAmount,
    isFullPayment: input.isFullPayment,
    allocations: [
      ...(input.cashGrossAmount > 0
        ? [{ method: BranchPaymentMethod.CASH, grossAmount: input.cashGrossAmount }]
        : []),
      ...(input.qrGrossAmount > 0
        ? [{ method: BranchPaymentMethod.QR, grossAmount: input.qrGrossAmount }]
        : []),
    ],
  });
}

export function splitPaymentIdempotencyKey(baseKey: string, method: string) {
  return `${baseKey}:${method}`;
}

export function buildSplitPaymentIdempotencyKeys(baseKey: string, methods: string[]) {
  return methods.map((method) => splitPaymentIdempotencyKey(baseKey, method));
}

export function hasSplitIdempotencyMarker(idempotencyKey?: string | null) {
  return Boolean(
    idempotencyKey?.includes(':CASH') ||
      idempotencyKey?.includes(':QR') ||
      idempotencyKey?.includes(':BANK'),
  );
}
