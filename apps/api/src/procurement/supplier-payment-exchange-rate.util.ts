import { roundMoneyDecimal, toMoneyDecimal } from './landed-cost-money.util';
import { roundMoney } from './supplier-payment.util';

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
