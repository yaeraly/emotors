import { roundMoney, buildFinanceDocumentNumber } from './finance-number.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(roundMoney(10.005), 10.01, 'round money up');
assertEqual(roundMoney(10.004), 10, 'round money down');
assertEqual(buildFinanceDocumentNumber('FAC').startsWith('FAC-'), true, 'finance number prefix');

console.log('finance-number.util.test.ts passed');
