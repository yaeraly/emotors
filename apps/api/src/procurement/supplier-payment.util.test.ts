import {
  calculateAmountKgs,
  isAllocatedSupplierPayment,
  isConfirmedSupplierPayment,
  maskCardNumber,
  resolvePurchasePaymentLedgerStatus,
  resolveSupplierPaymentKgs,
  sumConfirmedSupplierPaymentsKgs,
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
    { amountYuan: 10000, exchangeRate: 13.05, status: 'ACTIVE' },
    { amountYuan: 20000, exchangeRate: 13.18, status: 'ACTIVE' },
  ],
  30000,
);

assertClose(summary.totalPaidYuan, 30000, 'total paid yuan');
assertClose(summary.totalPaidKgs, 394100, 'total paid kgs');
assertClose(summary.weightedAverageYuanRate ?? 0, 13.1367, 'weighted average rate', 0.0001);
assertEqual(summary.supplierPaymentStatus, 'PAID', 'payment status paid');
assertClose(summary.remainingYuan, 0, 'remaining yuan');

const partial = summarizeSupplierPayments(
  [{ amountYuan: 10000, exchangeRate: 13.05, status: 'ACTIVE' }],
  30000,
);
assertEqual(partial.supplierPaymentStatus, 'PARTIALLY_PAID', 'partial status');
assertClose(partial.remainingYuan, 20000, 'partial remaining');

const overpaid = summarizeSupplierPayments(
  [
    { amountYuan: 20000, exchangeRate: 13.05, status: 'ACTIVE' },
    { amountYuan: 15000, exchangeRate: 13.18, status: 'ACTIVE' },
  ],
  30000,
);
assertEqual(overpaid.supplierPaymentStatus, 'OVERPAID', 'overpaid status');

assertClose(resolveSupplierPaymentKgs({ amountKgs: 1500, amountYuan: 100, exchangeRate: 10 }), 1500, 'stored kgs preferred');
assertClose(resolveSupplierPaymentKgs({ amountYuan: 100, exchangeRate: 12.5 }), 1250, 'fallback kgs');
assertClose(
  resolveSupplierPaymentKgs({ actualPaidKgs: 2400, approvedAmountKgs: 2420, amountYuan: 200, exchangeRate: 12.1 }),
  2400,
  'actual paid preferred',
);
assertClose(
  sumConfirmedSupplierPaymentsKgs([
    { status: 'ACTIVE', amountKgs: 1000, amountYuan: 100, exchangeRate: 11 },
    { status: 'PENDING_CASHIER', amountKgs: 500, amountYuan: 50, exchangeRate: 10 },
    { status: 'VOID', amountKgs: 500, amountYuan: 50, exchangeRate: 10 },
  ]),
  1000,
  'confirmed supplier total excludes pending',
);

assertEqual(isConfirmedSupplierPayment('ACTIVE'), true, 'active confirmed');
assertEqual(isConfirmedSupplierPayment('PENDING_CASHIER'), false, 'pending not confirmed');
assertEqual(isAllocatedSupplierPayment('PENDING_CASHIER'), true, 'pending allocated');
assertEqual(isAllocatedSupplierPayment('DRAFT'), true, 'draft allocated');
assertEqual(isAllocatedSupplierPayment('CANCELLED'), false, 'cancelled not allocated');

assertEqual(
  resolvePurchasePaymentLedgerStatus({
    totalOrderYuan: 100000,
    totalPaidYuan: 0,
    remainingYuan: 100000,
    pendingCashierCount: 0,
    invoiceSentToAccountantAt: new Date(),
  }),
  'AWAITING_ACCOUNTANT',
  'awaiting accountant',
);

assertEqual(
  resolvePurchasePaymentLedgerStatus({
    totalOrderYuan: 100000,
    totalPaidYuan: 0,
    remainingYuan: 100000,
    pendingCashierCount: 1,
    invoiceSentToAccountantAt: new Date(),
  }),
  'AWAITING_CASHIER',
  'awaiting cashier',
);

const pendingExcluded = summarizeSupplierPayments(
  [
    { amountYuan: 20000, exchangeRate: 12.1, status: 'PENDING_CASHIER' },
    { amountYuan: 30000, exchangeRate: 12.25, status: 'ACTIVE', actualPaidKgs: 367500 },
  ],
  100000,
  { invoiceSentToAccountantAt: new Date() },
);
assertClose(pendingExcluded.totalPaidYuan, 30000, 'only active counts as paid');
assertClose(pendingExcluded.totalPaidKgs, 367500, 'actual paid kgs used');
assertEqual(pendingExcluded.supplierPaymentStatus, 'PARTIALLY_PAID', 'partial with pending still partial');
assertEqual(pendingExcluded.pendingCashierCount, 1, 'pending cashier count');
assertClose(pendingExcluded.inFlightYuan, 50000, 'in-flight includes pending + active');

// Different rates preserved in weighted average (not arithmetic mean)
const multiRate = summarizeSupplierPayments(
  [
    { amountYuan: 20000, exchangeRate: 12.1, status: 'ACTIVE', actualPaidKgs: 242000 },
    { amountYuan: 30000, exchangeRate: 12.25, status: 'ACTIVE', actualPaidKgs: 367500 },
  ],
  100000,
);
assertClose(multiRate.weightedAverageYuanRate ?? 0, 609500 / 50000, 'weighted rate by amounts', 0.0001);
assertEqual(maskCardNumber('4111111111111111'), '************1111', 'card mask');

console.log('supplier-payment.util.test.ts passed');
