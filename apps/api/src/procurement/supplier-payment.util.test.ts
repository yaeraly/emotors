import {
  calculateAmountKgs,
  summarizeSupplierPayments,
} from './supplier-payment.util';

function assertClose(actual: number, expected: number, label: string, tolerance = 0.0001) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertClose(calculateAmountKgs(10000, 13.05), 130500, 'payment 1 kgs');
assertClose(calculateAmountKgs(20000, 13.18), 263600, 'payment 2 kgs');

const summary = summarizeSupplierPayments(
  [
    { amountYuan: 10000, exchangeRate: 13.05 },
    { amountYuan: 20000, exchangeRate: 13.18 },
  ],
  30000,
);

assertClose(summary.totalPaidYuan, 30000, 'total paid yuan');
assertClose(summary.totalPaidKgs, 394100, 'total paid kgs');
assertClose(summary.weightedAverageYuanRate ?? 0, 13.1367, 'weighted average rate', 0.0001);
assertEqual(summary.supplierPaymentStatus, 'PAID', 'payment status paid');
assertClose(summary.remainingYuan, 0, 'remaining yuan');

const partial = summarizeSupplierPayments([{ amountYuan: 10000, exchangeRate: 13.05 }], 30000);
assertEqual(partial.supplierPaymentStatus, 'PARTIALLY_PAID', 'partial status');
assertClose(partial.remainingYuan, 20000, 'partial remaining');

const overpaid = summarizeSupplierPayments(
  [
    { amountYuan: 20000, exchangeRate: 13.05 },
    { amountYuan: 15000, exchangeRate: 13.18 },
  ],
  30000,
);
assertEqual(overpaid.supplierPaymentStatus, 'OVERPAID', 'overpaid status');

console.log('supplier-payment.util.test.ts passed');
