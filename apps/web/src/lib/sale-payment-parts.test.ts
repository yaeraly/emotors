import {
  buildPaymentPayloads,
  computePaymentAllocation,
  createPaymentPartRow,
  isPaymentComplete,
  sumPaymentParts,
  validatePaymentParts,
} from './sale-payment-parts';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const defaultCash = createPaymentPartRow({ method: 'CASH' });
assertEqual(defaultCash.method, 'CASH', 'default payment row is CASH');

const cashOnly = [createPaymentPartRow({ method: 'CASH', cashReceived: '20000' })];
const cashOnlyAllocation = computePaymentAllocation(cashOnly, 20000);
assertEqual(cashOnlyAllocation.cashApplied, 20000, 'cash-only applied amount');
assertEqual(cashOnlyAllocation.changeAmount, 0, 'exact cash has no change');
assertEqual(isPaymentComplete(cashOnly, 20000), true, 'exact cash completes sale');

const cashChange = [createPaymentPartRow({ method: 'CASH', cashReceived: '25000' })];
assertEqual(computePaymentAllocation(cashChange, 20000).changeAmount, 5000, 'cash change');
assertEqual(isPaymentComplete(cashChange, 20000), true, 'excess cash completes sale');

const cashShort = [createPaymentPartRow({ method: 'CASH', cashReceived: '15000' })];
assertEqual(computePaymentAllocation(cashShort, 20000).cashShortage, 5000, 'cash shortage');
assertEqual(isPaymentComplete(cashShort, 20000), false, 'underpaid cash blocks completion');

const mixed = [
  createPaymentPartRow({ method: 'QR', amount: '8000' }),
  createPaymentPartRow({ method: 'CASH', cashReceived: '15000' }),
];
const mixedAllocation = computePaymentAllocation(mixed, 20000);
assertEqual(mixedAllocation.cashApplied, 12000, 'mixed cash applied');
assertEqual(mixedAllocation.changeAmount, 3000, 'mixed cash change');
assertEqual(sumPaymentParts(mixed, 20000), 20000, 'mixed payment total');
assertEqual(validatePaymentParts(mixed, 20000).ok, true, 'mixed payment valid');
assertEqual(isPaymentComplete(mixed, 20000), true, 'mixed payment complete');

const payloads = buildPaymentPayloads(mixed, 20000);
assertEqual(payloads.length, 2, 'mixed payloads count');
assertEqual(payloads[1]?.amount, 12000, 'cash payload uses applied amount');
assertEqual(payloads[1]?.cashReceived, 15000, 'cash payload keeps received amount');
assertEqual(payloads[1]?.changeAmount, 3000, 'cash payload keeps change');

const overNonCash = [createPaymentPartRow({ method: 'QR', amount: '15000' })];
assertEqual(validatePaymentParts(overNonCash, 10000).ok, false, 'non-cash overpayment rejected');

const duplicate = [
  createPaymentPartRow({ method: 'CASH', cashReceived: '5000' }),
  createPaymentPartRow({ method: 'CASH', cashReceived: '5000' }),
];
assertEqual(validatePaymentParts(duplicate, 10000).ok, false, 'duplicate methods rejected');

console.log('sale-payment-parts.test.ts passed');
