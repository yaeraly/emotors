import {
  SALE_PAYMENT_METHODS,
  formatPaymentMethodLabel,
  isSalePaymentMethod,
  paymentMethodLabelKey,
} from './sale-payment-methods';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(SALE_PAYMENT_METHODS.length, 4, 'exactly four sale payment methods');
assertEqual(isSalePaymentMethod('CASH'), true, 'CASH is supported');
assertEqual(isSalePaymentMethod('QR'), true, 'QR is supported');
assertEqual(isSalePaymentMethod('CARD'), true, 'CARD is supported');
assertEqual(isSalePaymentMethod('BANK_TRANSFER'), true, 'BANK_TRANSFER is supported');
assertEqual(isSalePaymentMethod('MBANK'), false, 'MBANK is legacy only');
assertEqual(paymentMethodLabelKey('QR'), 'sales.paymentMethods.QR', 'QR label key');
assertEqual(
  formatPaymentMethodLabel('MBANK', (key) => (key === 'sales.paymentMethods.MBANK' ? 'MBank' : key)),
  'MBank',
  'legacy MBANK label',
);

console.log('sale-payment-methods.test.ts passed');
