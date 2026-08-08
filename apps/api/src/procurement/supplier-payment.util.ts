import {
  ProcurementSupplierPaymentLedgerStatus,
  ProcurementSupplierPaymentStatus,
  Prisma,
} from '@prisma/client';
import {
  roundMoneyDecimal,
  sumMoneyDecimals,
  toMoneyDecimal,
} from './landed-cost-money.util';

export type SupplierPaymentInput = {
  amountYuan: number;
  exchangeRate: number;
  amountKgs?: number;
  actualPaidKgs?: number | null;
  approvedAmountKgs?: number | null;
  status?: ProcurementSupplierPaymentStatus | string;
};

export type SupplierPaymentSummary = {
  totalPaidYuan: number;
  totalPaidKgs: number;
  remainingYuan: number;
  weightedAverageYuanRate: number | null;
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus;
  completedPaymentCount: number;
  pendingCashierCount: number;
  inFlightYuan: number;
};

export function roundMoney(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateAmountKgs(amountYuan: number, exchangeRate: number) {
  return roundMoney(amountYuan * exchangeRate);
}

const EXCLUDED_SUPPLIER_PAYMENT_STATUSES = new Set([
  'DRAFT',
  'PENDING_CASHIER',
  'RETURNED',
  'RETURNED_FOR_CORRECTION',
  'CANCELLED',
  'CANCELED',
  'FAILED',
  'REJECTED',
  'VOID',
  'REVERSED',
  'SUPERSEDED',
  'POSTPONED',
]);

const CONFIRMED_SUPPLIER_PAYMENT_STATUSES = new Set([
  'ACTIVE',
  'CONFIRMED',
  'COMPLETED',
  'PAID',
]);

/** Statuses that reserve remaining CNY (cannot create overlapping tranches). */
const ALLOCATED_SUPPLIER_PAYMENT_STATUSES = new Set([
  'DRAFT',
  'PENDING_CASHIER',
  'RETURNED',
  'ACTIVE',
  'CONFIRMED',
  'COMPLETED',
  'PAID',
]);

export function isConfirmedSupplierPayment(status?: string | null) {
  const normalized = String(status ?? ProcurementSupplierPaymentStatus.ACTIVE).toUpperCase();
  if (EXCLUDED_SUPPLIER_PAYMENT_STATUSES.has(normalized)) return false;
  return CONFIRMED_SUPPLIER_PAYMENT_STATUSES.has(normalized);
}

export function isAllocatedSupplierPayment(status?: string | null) {
  const normalized = String(status ?? ProcurementSupplierPaymentStatus.ACTIVE).toUpperCase();
  return ALLOCATED_SUPPLIER_PAYMENT_STATUSES.has(normalized);
}

export function resolveSupplierPaymentKgsDecimal(payment: {
  amountKgs?: number | string | null;
  actualPaidKgs?: number | string | null;
  approvedAmountKgs?: number | string | null;
  amountYuan?: number | string | null;
  exchangeRate?: number | string | null;
}) {
  const actual = payment.actualPaidKgs;
  if (actual != null && Number(actual) >= 0) {
    return toMoneyDecimal(actual).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  const approved = payment.approvedAmountKgs;
  if (approved != null && Number(approved) >= 0) {
    return toMoneyDecimal(approved).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  const stored = payment.amountKgs;
  if (stored != null && Number(stored) >= 0) {
    return toMoneyDecimal(stored).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  const yuan = Number(payment.amountYuan ?? 0);
  const rate = Number(payment.exchangeRate ?? 0);
  if (!Number.isFinite(yuan) || !Number.isFinite(rate)) {
    return toMoneyDecimal(0);
  }
  return toMoneyDecimal(yuan)
    .times(toMoneyDecimal(rate))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function resolveSupplierPaymentKgs(payment: {
  amountKgs?: number | string | null;
  actualPaidKgs?: number | string | null;
  approvedAmountKgs?: number | string | null;
  amountYuan?: number | string | null;
  exchangeRate?: number | string | null;
}) {
  return roundMoneyDecimal(resolveSupplierPaymentKgsDecimal(payment));
}

export function sumConfirmedSupplierPaymentsKgs(
  payments: Array<{
    status?: string | null;
    amountKgs?: number | string | null;
    actualPaidKgs?: number | string | null;
    approvedAmountKgs?: number | string | null;
    amountYuan?: number | string | null;
    exchangeRate?: number | string | null;
  }>,
) {
  return roundMoney(
    payments
      .filter((payment) => isConfirmedSupplierPayment(payment.status))
      .reduce((sum, payment) => sum + resolveSupplierPaymentKgs(payment), 0),
  );
}

export function sumAllocatedSupplierPaymentsYuan(
  payments: Array<{ id?: string; status?: string | null; amountYuan?: number | string | null }>,
  excludePaymentId?: string,
) {
  return roundMoney(
    payments
      .filter((payment) => {
        if (excludePaymentId && payment.id === excludePaymentId) return false;
        return isAllocatedSupplierPayment(payment.status);
      })
      .reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
}

export function resolvePurchasePaymentLedgerStatus(input: {
  totalOrderYuan: number;
  totalPaidYuan: number;
  remainingYuan: number;
  pendingCashierCount: number;
  invoiceSentToAccountantAt?: Date | string | null;
  previousStatus?: string | null;
}): ProcurementSupplierPaymentLedgerStatus {
  const totalPaidYuan = roundMoney(input.totalPaidYuan);
  const totalOrderYuan = roundMoney(input.totalOrderYuan);
  const remainingYuan = roundMoney(input.remainingYuan);
  const previous = String(input.previousStatus ?? '').toUpperCase();

  if (totalPaidYuan > totalOrderYuan) {
    return ProcurementSupplierPaymentLedgerStatus.OVERPAID;
  }
  if (totalPaidYuan > 0 && remainingYuan <= 0) {
    return ProcurementSupplierPaymentLedgerStatus.PAID;
  }
  // Preserve postponed debt when no cashier task is in flight and balance remains
  // (including after a prior partial payment).
  if (
    previous === ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED &&
    remainingYuan > 0.009 &&
    input.pendingCashierCount <= 0
  ) {
    return ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED;
  }
  if (totalPaidYuan > 0 && remainingYuan > 0) {
    return ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID;
  }
  if (input.pendingCashierCount > 0) {
    return ProcurementSupplierPaymentLedgerStatus.AWAITING_CASHIER;
  }
  if (input.invoiceSentToAccountantAt) {
    return ProcurementSupplierPaymentLedgerStatus.AWAITING_ACCOUNTANT;
  }
  return ProcurementSupplierPaymentLedgerStatus.UNPAID;
}

export function summarizeSupplierPayments(
  payments: SupplierPaymentInput[],
  totalOrderYuan: number,
  options?: {
    invoiceSentToAccountantAt?: Date | string | null;
    previousStatus?: string | null;
  },
): SupplierPaymentSummary {
  const confirmed = payments.filter((payment) => isConfirmedSupplierPayment(payment.status));
  const pendingCashierCount = payments.filter(
    (payment) => String(payment.status ?? '').toUpperCase() === 'PENDING_CASHIER',
  ).length;
  const inFlightYuan = roundMoney(
    payments
      .filter((payment) => isAllocatedSupplierPayment(payment.status))
      .reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );

  const totalPaidYuan = roundMoneyDecimal(
    sumMoneyDecimals(confirmed.map((payment) => Number(payment.amountYuan || 0))),
  );
  const totalPaidKgs = roundMoneyDecimal(
    sumMoneyDecimals(confirmed.map((payment) => resolveSupplierPaymentKgsDecimal(payment))),
  );
  const remainingYuan = roundMoney(Math.max(totalOrderYuan - totalPaidYuan, 0));
  const weightedAverageYuanRate =
    totalPaidYuan > 0
      ? toMoneyDecimal(totalPaidKgs)
          .div(toMoneyDecimal(totalPaidYuan))
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          .toNumber()
      : null;

  const supplierPaymentStatus = resolvePurchasePaymentLedgerStatus({
    totalOrderYuan,
    totalPaidYuan,
    remainingYuan,
    pendingCashierCount,
    invoiceSentToAccountantAt: options?.invoiceSentToAccountantAt,
    previousStatus: options?.previousStatus,
  });

  return {
    totalPaidYuan,
    totalPaidKgs,
    remainingYuan,
    weightedAverageYuanRate,
    supplierPaymentStatus,
    completedPaymentCount: confirmed.length,
    pendingCashierCount,
    inFlightYuan,
  };
}

export function maskCardNumber(cardNumber: string) {
  const digits = cardNumber.replace(/\s+/g, '');
  if (digits.length < 4) return digits;
  return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}
