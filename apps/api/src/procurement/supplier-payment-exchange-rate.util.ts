import { roundMoneyDecimal, toMoneyDecimal } from './landed-cost-money.util';
import { roundMoney } from './supplier-payment.util';

export const SUPPLIER_CNY_RATE_REQUIRED_MESSAGE = 'Укажите курс CNY → KGS.';

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

export function resolveSupplierPaymentExchangeRate(input: {
  defaultYuanRate?: number | string | null;
  submittedRate?: number | string | null;
  payments?: Array<{ exchangeRate?: number | string | null; status?: string | null }>;
}): { rate: number; shouldPersist: boolean } {
  const locked = resolveLockedSupplierExchangeRate(input);
  if (locked != null) {
    return { rate: locked, shouldPersist: false };
  }

  const submitted = Number(input.submittedRate || 0);
  if (!(submitted > 0)) {
    throw new Error(SUPPLIER_CNY_RATE_REQUIRED_MESSAGE);
  }

  return { rate: roundMoney(submitted, 4), shouldPersist: true };
}

export function calculateApprovedSupplierKgsFromRate(
  approvedYuan: number,
  exchangeRate: number,
): number {
  return roundMoneyDecimal(
    toMoneyDecimal(approvedYuan).times(toMoneyDecimal(exchangeRate)),
  );
}
