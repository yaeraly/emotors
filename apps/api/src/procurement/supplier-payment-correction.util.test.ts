import { ProcurementSupplierPaymentStatus } from '@prisma/client';
import {
  assertCorrectedSupplierTotalCoversPaid,
  assertSupplierPaymentWithinRemaining,
  resolveSupplierInvoiceBalanceSnapshot,
  sumSupplierLineTotalYuan,
  SUPPLIER_CORRECTED_TOTAL_BELOW_PAID_MESSAGE,
  SUPPLIER_PAYMENT_EXCEEDS_REMAINING_MESSAGE,
} from './supplier-payment-correction.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.02) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn: () => unknown, messageIncludes: string, label: string) {
  try {
    fn();
    throw new Error(`${label}: expected throw`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(messageIncludes)) {
      throw new Error(`${label}: expected "${messageIncludes}", got ${message}`);
    }
  }
}

// Example: 50,000 → 55,000 with 1,933.48 paid
assertClose(
  sumSupplierLineTotalYuan([
    { quantity: 100, purchasePriceYuan: 550 },
  ]),
  55000,
  '5. new supplier total from lines',
);

const snapshot = resolveSupplierInvoiceBalanceSnapshot(55000, [
  {
    amountYuan: 1933.48,
    exchangeRate: 12,
    amountKgs: 23201.76,
    status: ProcurementSupplierPaymentStatus.ACTIVE,
  },
  {
    amountYuan: 48066.52,
    exchangeRate: 12,
    amountKgs: 576798.24,
    status: ProcurementSupplierPaymentStatus.RETURNED,
  },
]);
assertClose(snapshot.confirmedPaidCny, 1933.48, '6. confirmed paid preserved');
assertClose(snapshot.remainingCny, 53066.52, '7. remaining recalculated from new total');

assertThrows(
  () =>
    assertSupplierPaymentWithinRemaining({
      totalYuan: 50000,
      payments: [
        {
          amountYuan: 1933.48,
          exchangeRate: 12,
          amountKgs: 23201.76,
          status: ProcurementSupplierPaymentStatus.ACTIVE,
        },
        {
          amountYuan: 48066.52,
          exchangeRate: 12,
          amountKgs: 576798.24,
          status: ProcurementSupplierPaymentStatus.RETURNED,
        },
      ],
      amountYuan: 53066.52,
    }),
  SUPPLIER_PAYMENT_EXCEEDS_REMAINING_MESSAGE,
  '13. stale returned request blocks against old total',
);

assertSupplierPaymentWithinRemaining({
  totalYuan: 55000,
  payments: [
    {
      amountYuan: 1933.48,
      exchangeRate: 12,
      amountKgs: 23201.76,
      status: ProcurementSupplierPaymentStatus.ACTIVE,
    },
  ],
  amountYuan: 53066.52,
});
assert(true, '12. full payment equals current remaining after stale removal');

assertThrows(
  () => assertCorrectedSupplierTotalCoversPaid(45000, 50000),
  SUPPLIER_CORRECTED_TOTAL_BELOW_PAID_MESSAGE,
  '16. corrected total below paid blocked',
);

console.log('supplier-payment-correction.util.test.ts passed');
