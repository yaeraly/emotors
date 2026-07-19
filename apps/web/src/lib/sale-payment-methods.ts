import type { PaymentMethod } from './types';

/** Canonical payment methods shown on Branch Sales sale flows. */
export const SALE_PAYMENT_METHODS = [
  'CASH',
  'QR',
  'CARD',
  'BANK_TRANSFER',
] as const satisfies readonly PaymentMethod[];

export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];

const SALE_PAYMENT_METHOD_SET = new Set<string>(SALE_PAYMENT_METHODS);

export function isSalePaymentMethod(method: string): method is SalePaymentMethod {
  return SALE_PAYMENT_METHOD_SET.has(method);
}

/** Display labels for legacy or non-standard stored values without changing records. */
const LEGACY_PAYMENT_METHOD_LABEL_KEYS: Partial<Record<PaymentMethod, string>> = {
  MBANK: 'sales.paymentMethods.MBANK',
  ELCART: 'sales.paymentMethods.ELCART',
  BALANCE: 'sales.paymentMethods.BALANCE',
  MIXED: 'sales.paymentMethods.MIXED',
};

export function paymentMethodLabelKey(method: PaymentMethod | string): string {
  if (isSalePaymentMethod(method)) {
    return `sales.paymentMethods.${method}`;
  }
  const legacy = LEGACY_PAYMENT_METHOD_LABEL_KEYS[method as PaymentMethod];
  if (legacy) return legacy;
  return `sales.paymentMethods.${method}`;
}

export function formatPaymentMethodLabel(
  method: PaymentMethod | string,
  t: (key: string) => string,
): string {
  const key = paymentMethodLabelKey(method);
  const label = t(key);
  return label === key ? String(method) : label;
}
