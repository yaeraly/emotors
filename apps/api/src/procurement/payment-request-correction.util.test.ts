import { ProcurementSupplierPaymentStatus } from '@prisma/client';
import { TransportExpenseStatus } from '@prisma/client';
import {
  resolveCargoCashierReturnedPaymentRequest,
  resolveLatestCashierReturnedSupplierPaymentRequest,
  PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
} from './payment-request-correction.util';
import { getCargoBillActionVisibility } from './cargo-bill-actions.util';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const supplierPayments = [
  {
    id: 'p1',
    status: ProcurementSupplierPaymentStatus.ACTIVE,
    exchangeRate: 12.9,
    amountYuan: 10000,
    amountKgs: 129000,
    approvedAmountKgs: 129000,
    paidAt: '2026-01-01T10:00:00Z',
    createdAt: '2026-01-01T10:00:00Z',
  },
  {
    id: 'p2',
    status: ProcurementSupplierPaymentStatus.RETURNED,
    executionStatus: PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
    exchangeRate: 13.05,
    amountYuan: 15000,
    amountKgs: 195750,
    approvedAmountKgs: 195750,
    returnReason: 'Insufficient balance',
    returnedAt: '2026-02-01T10:00:00Z',
    createdAt: '2026-02-01T09:00:00Z',
  },
  {
    id: 'p3',
    status: ProcurementSupplierPaymentStatus.CANCELLED,
    executionRate: 99,
    exchangeRate: 99,
    amountYuan: 5000,
    amountKgs: 500000,
    approvedAmountKgs: 500000,
    returnedAt: '2026-03-01T10:00:00Z',
    createdAt: '2026-03-01T10:00:00Z',
  },
];

const latestSupplier = resolveLatestCashierReturnedSupplierPaymentRequest(supplierPayments);
assertEqual(latestSupplier?.requestedAmountKgs, 195750, '1. latest returned supplier request');
assertEqual(latestSupplier?.requestedAmountCny, 15000, '2. latest returned supplier cny');
assertEqual(latestSupplier?.returnReason, 'Insufficient balance', '3. return reason preserved');

const cargoReturned = resolveCargoCashierReturnedPaymentRequest({
  status: TransportExpenseStatus.RETURNED,
  executionStatus: PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
  returnReason: 'Not enough cash',
  cashierInstructionAmountKgs: 300000,
  returnedAt: '2026-02-01T10:00:00Z',
});
assertEqual(cargoReturned?.requestedAmountKgs, 300000, '4. cargo returned request amount');

const resendVisibility = getCargoBillActionVisibility({
  uiStatus: 'RETURNED',
  paidAmount: 0,
  remainingAmount: 500000,
  executionStatus: PAYMENT_REQUEST_RETURNED_EXECUTION_STATUS,
});
assertEqual(resendVisibility.showPartial, true, '5. cashier returned cargo allows partial resend');
assertEqual(resendVisibility.showCashierReturnedBanner, true, '6. cashier returned banner');

const supplierResendVisibility = getCargoBillActionVisibility({
  uiStatus: 'PARTIALLY_PAID',
  paidAmount: 129000,
  remainingAmount: 200000,
  hasCashierReturnedRequest: true,
});
assertEqual(supplierResendVisibility.showPartial, true, '7. supplier cashier return allows partial resend');

console.log('payment-request-correction.util.test.ts passed');
