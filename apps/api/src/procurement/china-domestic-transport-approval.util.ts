import { roundMoneyDecimal, toMoneyDecimal } from './landed-cost-money.util';
import { roundMoney } from './supplier-payment.util';

export const CHINA_TRANSPORT_CNY_RATE_REQUIRED_MESSAGE = 'Укажите курс CNY → KGS.';

export function resolveChinaTransportApprovalExchangeRate(
  submittedRate?: number | null,
): number {
  const rate = Number(submittedRate || 0);
  if (!(rate > 0)) {
    throw new Error(CHINA_TRANSPORT_CNY_RATE_REQUIRED_MESSAGE);
  }
  return roundMoney(rate, 4);
}

export function calculateApprovedChinaTransportKgsFromRate(
  amountCny: number,
  exchangeRate: number,
): number {
  return roundMoneyDecimal(
    toMoneyDecimal(amountCny).times(toMoneyDecimal(exchangeRate)),
  );
}
