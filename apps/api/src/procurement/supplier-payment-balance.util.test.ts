import {
  assertSupplierPaymentHasRemainingBalance,
  isSupplierPaymentStatusInconsistentWithBalance,
  resolveReconciledSupplierPaymentLedgerStatus,
  resolveSupplierPaymentMonetaryBalance,
  SUPPLIER_ALREADY_FULLY_PAID_MESSAGE,
} from './supplier-payment-balance.util';
import { ProcurementSupplierPaymentLedgerStatus } from '@prisma/client';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 0.01) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const partialPayments = [
  {
    amountYuan: 40000,
    exchangeRate: 13,
    amountKgs: 520000,
    approvedAmountKgs: 520000,
    status: 'ACTIVE',
  },
];

const balance = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 100000,
  exchangeRate: 13,
  payments: partialPayments,
});

assertClose(balance.confirmedPaidCny, 40000, '1. confirmed paid cny');
assertClose(balance.remainingCny, 60000, '1. remaining cny');
assertClose(balance.remainingKgs, 780000, '1. remaining kgs');
assertEqual(balance.isFullyPaid, false, '1. not fully paid');
assertEqual(balance.isPayable, true, '1. payable');

assertEqual(
  resolveReconciledSupplierPaymentLedgerStatus({
    totalYuan: 100000,
    exchangeRate: 13,
    payments: partialPayments,
  }),
  ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID,
  '7. partial ledger status',
);

let threwFullyPaid = false;
try {
  assertSupplierPaymentHasRemainingBalance({
    ...balance,
    isFullyPaid: true,
    isPayable: false,
    remainingCny: 0,
    remainingKgs: 0,
  });
} catch (error) {
  threwFullyPaid =
    error instanceof Error && error.message === SUPPLIER_ALREADY_FULLY_PAID_MESSAGE;
}
if (!threwFullyPaid) throw new Error('9. fully paid guard throws Russian message');

assertEqual(
  isSupplierPaymentStatusInconsistentWithBalance({
    supplierPaymentStatus: 'PAID',
    balance,
  }),
  true,
  '10. stale paid status detected',
);

const cnyPaidKgsRemaining = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 100000,
  exchangeRate: 13.2,
  payments: [
    { amountYuan: 40000, exchangeRate: 13, amountKgs: 520000, status: 'ACTIVE' },
    { amountYuan: 60000, exchangeRate: 13, amountKgs: 780000, status: 'ACTIVE' },
  ],
});
assertClose(cnyPaidKgsRemaining.remainingCny, 0, '12. cny fully paid');
assertClose(cnyPaidKgsRemaining.remainingKgs, 20000, '12. kgs still remaining after rate change');
assertEqual(
  resolveReconciledSupplierPaymentLedgerStatus({
    totalYuan: 100000,
    exchangeRate: 13.2,
    payments: [
      { amountYuan: 40000, exchangeRate: 13, amountKgs: 520000, status: 'ACTIVE' },
      { amountYuan: 60000, exchangeRate: 13, amountKgs: 780000, status: 'ACTIVE' },
    ],
  }),
  ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID,
  '12b. kgs remaining keeps partial status',
);

const closingPayment = resolveSupplierPaymentMonetaryBalance({
  totalYuan: 100000,
  exchangeRate: 13,
  payments: [
    ...partialPayments,
    { amountYuan: 60000, exchangeRate: 13, amountKgs: 780000, approvedAmountKgs: 780000, status: 'ACTIVE' },
  ],
});
assertEqual(closingPayment.isFullyPaid, true, '6. final payment closes invoice');
assertEqual(
  resolveReconciledSupplierPaymentLedgerStatus({
    totalYuan: 100000,
    exchangeRate: 13,
    payments: [
      ...partialPayments,
      { amountYuan: 60000, exchangeRate: 13, amountKgs: 780000, approvedAmountKgs: 780000, status: 'ACTIVE' },
    ],
  }),
  ProcurementSupplierPaymentLedgerStatus.PAID,
  '6b. final status paid',
);

console.log('supplier-payment-balance.util.test.ts passed');
