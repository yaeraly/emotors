import {
  cashChangeForRow,
  createPaymentPartRow,
  sumPaymentParts,
  validatePaymentParts,
} from './sale-payment-parts';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const rows = [
  createPaymentPartRow({ method: 'QR', amount: '4000' }),
  createPaymentPartRow({ method: 'CASH', amount: '6000', cashReceived: '7000' }),
];

assertEqual(sumPaymentParts(rows), 10000, 'mixed payment total');
assertEqual(cashChangeForRow(rows[1]), 1000, 'cash change');
assertEqual(validatePaymentParts(rows, 10000).ok, true, 'exact mixed payment valid');

const overNonCash = [
  createPaymentPartRow({ method: 'QR', amount: '15000' }),
];
assertEqual(
  validatePaymentParts(overNonCash, 10000).ok,
  false,
  'non-cash overpayment rejected',
);

const duplicate = [
  createPaymentPartRow({ method: 'CASH', amount: '5000' }),
  createPaymentPartRow({ method: 'CASH', amount: '5000' }),
];
assertEqual(validatePaymentParts(duplicate, 10000).ok, false, 'duplicate methods rejected');

console.log('sale-payment-parts.test.ts passed');
