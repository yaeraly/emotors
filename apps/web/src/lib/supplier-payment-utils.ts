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

export type SupplierPaymentDisplayStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export type PurchaseOrderSupplierPaymentSummary = {
  orderTotalKgs: number;
  paidAmountKgs: number;
  remainingToPayKgs: number;
  paymentStatus: SupplierPaymentDisplayStatus;
  statusTranslationKey: `procurement.sectionPayable.statusValue.${SupplierPaymentDisplayStatus}`;
};

export function resolvePurchaseOrderTotalKgs(input: {
  estimatedSupplierCostKgs?: number | string | null;
  totalYuan?: number | string | null;
  defaultYuanRate?: number | string | null;
  effectiveYuanRate?: number | string | null;
  totalPurchaseCostKgs?: number;
}) {
  const estimatedOrderTotalKgs = Number(input.estimatedSupplierCostKgs ?? 0);
  if (estimatedOrderTotalKgs > 0) return roundMoney(estimatedOrderTotalKgs);

  const previewTotal = Number(input.totalPurchaseCostKgs ?? 0);
  if (previewTotal > 0) return roundMoney(previewTotal);

  return roundMoney(
    Number(input.totalYuan ?? 0) * Number(input.defaultYuanRate ?? input.effectiveYuanRate ?? 0),
  );
}

/** Shared payment-status resolver for purchase order UI. */
export function resolveSupplierPaymentDisplayStatus(input: {
  paidAmountKgs: number;
  orderTotalKgs: number;
}): SupplierPaymentDisplayStatus {
  const paidAmount = roundMoney(Number(input.paidAmountKgs || 0));
  const totalAmount = roundMoney(Number(input.orderTotalKgs || 0));

  if (paidAmount <= 0) return 'UNPAID';
  if (totalAmount > 0 && paidAmount >= totalAmount) return 'PAID';
  return 'PARTIALLY_PAID';
}

export function getSupplierPaymentStatusTranslationKey(
  paymentStatus: SupplierPaymentDisplayStatus,
): `procurement.sectionPayable.statusValue.${SupplierPaymentDisplayStatus}` {
  return `procurement.sectionPayable.statusValue.${paymentStatus}`;
}

export function resolveSupplierPaymentRemainingKgs(input: {
  orderTotalKgs: number;
  paidAmountKgs: number;
}) {
  return Math.max(roundMoney(input.orderTotalKgs) - roundMoney(input.paidAmountKgs), 0);
}

export function buildPurchaseOrderSupplierPaymentSummary(input: {
  estimatedSupplierCostKgs?: number | string | null;
  totalYuan?: number | string | null;
  defaultYuanRate?: number | string | null;
  effectiveYuanRate?: number | string | null;
  totalPurchaseCostKgs?: number;
  supplierPayments?: Array<{
    status?: string | null;
    amountKgs?: number | string | null;
    actualPaidKgs?: number | string | null;
    approvedAmountKgs?: number | string | null;
    amountYuan?: number | string | null;
    exchangeRate?: number | string | null;
  }>;
}): PurchaseOrderSupplierPaymentSummary {
  const orderTotalKgs = resolvePurchaseOrderTotalKgs(input);
  const paidAmountKgs = sumConfirmedSupplierPaymentsKgs(input.supplierPayments ?? []);
  const paymentStatus = resolveSupplierPaymentDisplayStatus({
    paidAmountKgs,
    orderTotalKgs,
  });

  return {
    orderTotalKgs,
    paidAmountKgs,
    remainingToPayKgs: resolveSupplierPaymentRemainingKgs({ orderTotalKgs, paidAmountKgs }),
    paymentStatus,
    statusTranslationKey: getSupplierPaymentStatusTranslationKey(paymentStatus),
  };
}

export type SupplierPaymentProgressStepState = 'completed' | 'unavailable';

export function getSupplierPaymentProgressStepState(
  paymentStatus: SupplierPaymentDisplayStatus,
): SupplierPaymentProgressStepState {
  if (paymentStatus === 'PAID' || paymentStatus === 'PARTIALLY_PAID') {
    return 'completed';
  }
  return 'unavailable';
}

export function canContinueProcurementWorkflow(paymentStatus: SupplierPaymentDisplayStatus) {
  return paymentStatus === 'PARTIALLY_PAID' || paymentStatus === 'PAID';
}
