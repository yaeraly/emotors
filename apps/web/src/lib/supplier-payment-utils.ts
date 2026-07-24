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

export type SupplierPaymentDisplayLabelStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export type SupplierPaymentStatusLabelRole =
  | 'SUPPLY_CHAIN_MANAGER'
  | 'ACCOUNTANT'
  | 'CASHIER'
  | 'FINANCIAL';

export function resolveFinancialSupplierPaymentDisplayStatus(input: {
  paidAmountKgs: number;
  orderTotalKgs: number;
}): SupplierPaymentDisplayLabelStatus {
  const paidAmountKgs = roundMoney(Number(input.paidAmountKgs || 0));
  const orderTotalKgs = roundMoney(Number(input.orderTotalKgs || 0));

  if (paidAmountKgs <= 0) return 'UNPAID';
  if (orderTotalKgs > 0 && paidAmountKgs >= orderTotalKgs) return 'PAID';
  return 'PARTIALLY_PAID';
}

export function resolveSupplyManagerSupplierPaymentDisplayStatus(
  paidAmountKgs: number,
): Extract<SupplierPaymentDisplayLabelStatus, 'UNPAID' | 'PAID'> {
  return Number(paidAmountKgs) > 0 ? 'PAID' : 'UNPAID';
}

/** Display-only label resolver. Does not mutate stored supplier payment status. */
export function getSupplierPaymentStatusLabel(input: {
  actualPaymentStatus?: string | null;
  userRole: SupplierPaymentStatusLabelRole;
  paidAmountKgs: number;
  orderTotalKgs: number;
}): SupplierPaymentDisplayLabelStatus {
  void input.actualPaymentStatus;

  if (input.userRole === 'SUPPLY_CHAIN_MANAGER') {
    return resolveSupplyManagerSupplierPaymentDisplayStatus(input.paidAmountKgs);
  }

  return resolveFinancialSupplierPaymentDisplayStatus({
    paidAmountKgs: input.paidAmountKgs,
    orderTotalKgs: input.orderTotalKgs,
  });
}

export function getSupplierPaymentStatusTranslationKey(
  label: SupplierPaymentDisplayLabelStatus,
): `procurement.payments.status.${SupplierPaymentDisplayLabelStatus}` {
  return `procurement.payments.status.${label}`;
}

export function resolveSupplierPaymentRemainingKgs(input: {
  orderTotalKgs: number;
  paidAmountKgs: number;
}) {
  return Math.max(roundMoney(input.orderTotalKgs) - roundMoney(input.paidAmountKgs), 0);
}
