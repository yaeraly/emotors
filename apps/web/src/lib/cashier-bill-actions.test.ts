import {
  canCashierReportPaymentFailure,
  CASHIER_PROCUREMENT_IMPORT_REQUEST_TYPES,
} from './cashier-bill-actions';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

for (const requestType of [
  'CHINA_DOMESTIC_TRANSPORT',
  'SUPPLIER_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
] as const) {
  assertEqual(
    canCashierReportPaymentFailure(requestType),
    false,
    `${requestType} hides report-failure button`,
  );
  if (!CASHIER_PROCUREMENT_IMPORT_REQUEST_TYPES.has(requestType)) {
    throw new Error(`${requestType} should be in procurement import set`);
  }
}

assertEqual(canCashierReportPaymentFailure('OTHER_PROCUREMENT_EXPENSE'), true, 'other types keep fail');

console.log('cashier-bill-actions.test.ts passed');
