import {
  ProcurementSupplierPaymentLedgerStatus,
  ProcurementSupplierPaymentStatus,
} from '@prisma/client';

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
  'CANCELLED',
  'CANCELED',
  'FAILED',
  'REJECTED',
  'VOID',
  'REVERSED',
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

export function resolveSupplierPaymentKgs(payment: {
  amountKgs?: number | string | null;
  actualPaidKgs?: number | string | null;
  approvedAmountKgs?: number | string | null;
  amountYuan?: number | string | null;
  exchangeRate?: number | string | null;
}) {
  const actual = Number(payment.actualPaidKgs);
  if (Number.isFinite(actual) && actual >= 0) return roundMoney(actual);
  const approved = Number(payment.approvedAmountKgs);
  if (Number.isFinite(approved) && approved >= 0) return roundMoney(approved);
  const stored = Number(payment.amountKgs);
  if (Number.isFinite(stored) && stored >= 0) return roundMoney(stored);
  const yuan = Number(payment.amountYuan ?? 0);
  const rate = Number(payment.exchangeRate ?? 0);
  if (!Number.isFinite(yuan) || !Number.isFinite(rate)) return 0;
  return calculateAmountKgs(yuan, rate);
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
}): ProcurementSupplierPaymentLedgerStatus {
  const totalPaidYuan = roundMoney(input.totalPaidYuan);
  const totalOrderYuan = roundMoney(input.totalOrderYuan);
  const remainingYuan = roundMoney(input.remainingYuan);

  if (totalPaidYuan > totalOrderYuan) {
    return ProcurementSupplierPaymentLedgerStatus.OVERPAID;
  }
  if (totalPaidYuan > 0 && remainingYuan <= 0) {
    return ProcurementSupplierPaymentLedgerStatus.PAID;
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
  options?: { invoiceSentToAccountantAt?: Date | string | null },
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

  const totalPaidYuan = roundMoney(
    confirmed.reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  const totalPaidKgs = roundMoney(
    confirmed.reduce((sum, payment) => sum + resolveSupplierPaymentKgs(payment), 0),
  );
  const remainingYuan = roundMoney(Math.max(totalOrderYuan - totalPaidYuan, 0));
  const weightedAverageYuanRate =
    totalPaidYuan > 0 ? roundMoney(totalPaidKgs / totalPaidYuan, 4) : null;

  const supplierPaymentStatus = resolvePurchasePaymentLedgerStatus({
    totalOrderYuan,
    totalPaidYuan,
    remainingYuan,
    pendingCashierCount,
    invoiceSentToAccountantAt: options?.invoiceSentToAccountantAt,
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
