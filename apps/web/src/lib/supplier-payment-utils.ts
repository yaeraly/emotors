export function roundMoney(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
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

const CONFIRMED_SUPPLIER_PAYMENT_STATUSES = new Set(['ACTIVE', 'CONFIRMED', 'COMPLETED', 'PAID']);

export function isConfirmedSupplierPayment(status?: string | null) {
  const normalized = String(status ?? 'ACTIVE').toUpperCase();
  if (EXCLUDED_SUPPLIER_PAYMENT_STATUSES.has(normalized)) return false;
  return CONFIRMED_SUPPLIER_PAYMENT_STATUSES.has(normalized);
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
  return roundMoney(yuan * rate);
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
