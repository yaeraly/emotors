import { roundMoneyDecimal, toMoneyDecimal } from './landed-cost-money.util';
import { isConfirmedSupplierPayment, roundMoney } from './supplier-payment.util';

export const SUPPLIER_CNY_RATE_REQUIRED_MESSAGE = 'Укажите курс CNY → KGS.';

export const SUPPLIER_PAYMENT_RATE_LOCK_ACTIONS = [
  'SUPPLIER_PAYMENT_SENT_TO_CASHIER',
  'SUPPLIER_PARTIAL_PAYMENT_CREATED',
  'SUPPLIER_PAYMENT_FULLY_PAID',
] as const;

export const SUPPLIER_PAYMENT_RATE_REVISION_TRIGGER_ACTIONS = [
  'SUPPLIER_PAYMENT_RESUBMITTED',
] as const;

export type SupplierPaymentRateAuditInput = {
  action?: string | null;
  timestamp?: Date | string | null;
};

export function resolveLockedSupplierExchangeRate(input: {
  defaultYuanRate?: number | string | null;
  payments?: Array<{ exchangeRate?: number | string | null; status?: string | null }>;
}): number | null {
  const fromOrder = Number(input.defaultYuanRate || 0);
  if (fromOrder > 0) {
    return roundMoney(fromOrder, 4);
  }

  const paymentRates = (input.payments ?? [])
    .map((payment) => Number(payment.exchangeRate || 0))
    .filter((rate) => rate > 0);
  const fromPayment = paymentRates.at(-1);
  return fromPayment != null && fromPayment > 0 ? roundMoney(fromPayment, 4) : null;
}

export function isSupplierPaymentExchangeRateRevisionAllowed(
  audits: SupplierPaymentRateAuditInput[],
): boolean {
  const sorted = [...audits].sort(
    (left, right) =>
      new Date(right.timestamp ?? 0).getTime() - new Date(left.timestamp ?? 0).getTime(),
  );
  const latestResubmit = sorted.find((row) =>
    SUPPLIER_PAYMENT_RATE_REVISION_TRIGGER_ACTIONS.includes(
      String(row.action ?? '') as (typeof SUPPLIER_PAYMENT_RATE_REVISION_TRIGGER_ACTIONS)[number],
    ),
  );
  if (!latestResubmit?.timestamp) return false;

  const resubmitAt = new Date(latestResubmit.timestamp).getTime();
  const latestLock = sorted.find((row) =>
    SUPPLIER_PAYMENT_RATE_LOCK_ACTIONS.includes(
      String(row.action ?? '') as (typeof SUPPLIER_PAYMENT_RATE_LOCK_ACTIONS)[number],
    ),
  );
  if (!latestLock?.timestamp) return true;
  return resubmitAt > new Date(latestLock.timestamp).getTime();
}

export function resolveSupplierPaymentExchangeRate(input: {
  defaultYuanRate?: number | string | null;
  submittedRate?: number | string | null;
  payments?: Array<{ exchangeRate?: number | string | null; status?: string | null }>;
  allowRateRevision?: boolean;
}): {
  rate: number;
  shouldPersist: boolean;
  previousRate: number | null;
  rateRevised: boolean;
} {
  const locked = resolveLockedSupplierExchangeRate(input);
  const submitted = Number(input.submittedRate || 0);

  if (input.allowRateRevision) {
    if (!(submitted > 0)) {
      throw new Error(SUPPLIER_CNY_RATE_REQUIRED_MESSAGE);
    }
    const rate = roundMoney(submitted, 4);
    const rateRevised = locked != null && Math.abs(rate - locked) > 0.00009;
    return {
      rate,
      shouldPersist: rateRevised || locked == null,
      previousRate: locked,
      rateRevised,
    };
  }

  if (locked != null) {
    return { rate: locked, shouldPersist: false, previousRate: locked, rateRevised: false };
  }

  if (!(submitted > 0)) {
    throw new Error(SUPPLIER_CNY_RATE_REQUIRED_MESSAGE);
  }

  return {
    rate: roundMoney(submitted, 4),
    shouldPersist: true,
    previousRate: null,
    rateRevised: false,
  };
}

export function calculateApprovedSupplierKgsFromRate(
  approvedYuan: number,
  exchangeRate: number,
): number {
  return roundMoneyDecimal(
    toMoneyDecimal(approvedYuan).times(toMoneyDecimal(exchangeRate)),
  );
}

export function countSupplierExchangeRateRevisions(
  audits: SupplierPaymentRateAuditInput[],
): number {
  return audits.filter((row) => String(row.action ?? '').toUpperCase() === 'SUPPLIER_EXCHANGE_RATE_REVISED')
    .length;
}

const IN_FLIGHT_SUPPLIER_PAYMENT_STATUSES = new Set(['PENDING_CASHIER', 'DRAFT']);

export type SupplierPaymentExchangeRateHistoryInput = {
  exchangeRate?: number | string | null;
  status?: string | null;
  paidAt?: Date | string | null;
  paymentDate?: Date | string | null;
  createdAt?: Date | string | null;
  sentToCashierAt?: Date | string | null;
};

function toExchangeRateTimestamp(value?: Date | string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function formatSupplierExchangeRateString(rate: number): string | null {
  if (!(rate > 0)) return null;
  const rounded = roundMoney(rate, 4);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function compareConfirmedPaymentRateRecency(
  left: SupplierPaymentExchangeRateHistoryInput,
  right: SupplierPaymentExchangeRateHistoryInput,
): number {
  const leftTime = Math.max(
    toExchangeRateTimestamp(left.paidAt),
    toExchangeRateTimestamp(left.paymentDate),
    toExchangeRateTimestamp(left.createdAt),
  );
  const rightTime = Math.max(
    toExchangeRateTimestamp(right.paidAt),
    toExchangeRateTimestamp(right.paymentDate),
    toExchangeRateTimestamp(right.createdAt),
  );
  return rightTime - leftTime;
}

/** Latest confirmed/paid payment rate for the same invoice, ordered by paidAt/paymentDate/createdAt. */
export function resolveLatestConfirmedSupplierPaymentExchangeRate(
  payments: SupplierPaymentExchangeRateHistoryInput[],
): number | null {
  const latest = payments
    .filter((payment) => isConfirmedSupplierPayment(payment.status))
    .filter((payment) => Number(payment.exchangeRate || 0) > 0)
    .sort(compareConfirmedPaymentRateRecency);
  const rate = latest[0] ? Number(latest[0].exchangeRate) : 0;
  return rate > 0 ? roundMoney(rate, 4) : null;
}

export function resolveInFlightSupplierPaymentExchangeRate(
  payments: SupplierPaymentExchangeRateHistoryInput[],
): number | null {
  const latest = payments
    .filter((payment) =>
      IN_FLIGHT_SUPPLIER_PAYMENT_STATUSES.has(String(payment.status ?? '').toUpperCase()),
    )
    .filter((payment) => Number(payment.exchangeRate || 0) > 0)
    .sort((left, right) => {
      const leftTime = Math.max(
        toExchangeRateTimestamp(left.sentToCashierAt),
        toExchangeRateTimestamp(left.createdAt),
      );
      const rightTime = Math.max(
        toExchangeRateTimestamp(right.sentToCashierAt),
        toExchangeRateTimestamp(right.createdAt),
      );
      return rightTime - leftTime;
    });
  const rate = latest[0] ? Number(latest[0].exchangeRate) : 0;
  return rate > 0 ? roundMoney(rate, 4) : null;
}

export function resolveApprovedSupplierInvoiceExchangeRate(input: {
  defaultYuanRate?: number | string | null;
  weightedAverageYuanRate?: number | string | null;
}): number | null {
  const rate = Number(input.defaultYuanRate || input.weightedAverageYuanRate || 0);
  return rate > 0 ? roundMoney(rate, 4) : null;
}

export function resolveSupplierPaymentDialogDefaultExchangeRate(input: {
  payments: SupplierPaymentExchangeRateHistoryInput[];
  defaultYuanRate?: number | string | null;
  weightedAverageYuanRate?: number | string | null;
}): {
  lastPaidExchangeRateCnyKgs: string | null;
  defaultExchangeRateCnyKgs: string | null;
} {
  const lastPaidRate = resolveLatestConfirmedSupplierPaymentExchangeRate(input.payments);
  const fallbackRate =
    lastPaidRate ??
    resolveInFlightSupplierPaymentExchangeRate(input.payments) ??
    resolveApprovedSupplierInvoiceExchangeRate(input);

  return {
    lastPaidExchangeRateCnyKgs:
      lastPaidRate != null ? formatSupplierExchangeRateString(lastPaidRate) : null,
    defaultExchangeRateCnyKgs:
      fallbackRate != null ? formatSupplierExchangeRateString(fallbackRate) : null,
  };
}

/** Read-only invoice detail: latest paid rate, then saved approved rate, never in-flight. */
export function resolveSupplierPaymentDetailDisplayExchangeRate(input: {
  payments: SupplierPaymentExchangeRateHistoryInput[];
  defaultYuanRate?: number | string | null;
  weightedAverageYuanRate?: number | string | null;
}): string | null {
  const lastPaidRate = resolveLatestConfirmedSupplierPaymentExchangeRate(input.payments);
  if (lastPaidRate != null) return formatSupplierExchangeRateString(lastPaidRate);
  const approvedRate = resolveApprovedSupplierInvoiceExchangeRate(input);
  return approvedRate != null ? formatSupplierExchangeRateString(approvedRate) : null;
}
