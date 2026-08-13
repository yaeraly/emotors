import {
  formatKgsPreview,
  normalizeExchangeRateInput,
  parseExchangeRateInput,
  parsePaymentAmountKgsInput,
  previewCnyToKgs,
  resolveSupplierCurrentRemainingKgs,
} from './supplier-payment-cny-preview.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(normalizeExchangeRateInput('13.25'), '13.25', 'rate typing 13.25');
assertEqual(parseExchangeRateInput('13'), 13, '6. parse 13');
assertEqual(previewCnyToKgs(60000, '13'), 780000, '6. 60000 CNY at 13');
assertEqual(resolveSupplierCurrentRemainingKgs(20000, '13'), 260000, '1. remaining at current rate');
assertEqual(resolveSupplierCurrentRemainingKgs(20000, '13.1'), 262000, '7. rate change updates remaining kgs');
assertEqual(parsePaymentAmountKgsInput('100 000'), 100000, 'partial kgs input parsing');
assertEqual(formatKgsPreview(previewCnyToKgs(60000, '')), '—', 'empty rate shows dash');
assertEqual(formatKgsPreview(780000), '780000.00 сом', 'formatted preview');

console.log('supplier-payment-cny-preview.util.test.ts passed');
