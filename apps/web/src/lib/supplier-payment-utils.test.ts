import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPurchaseOrderSupplierPaymentSummary,
  getSupplierPaymentProgressStepState,
  getSupplierPaymentStatusTranslationKey,
  resolveSupplierPaymentDisplayStatus,
  resolveSupplierPaymentRemainingKgs,
} from './supplier-payment-utils';

const ORDER_TOTAL = 100_000;
const PARTIAL_PAID = 30_000;
const FULL_PAID = 100_000;

const confirmedPayment = (amountKgs: number) => ({
  status: 'ACTIVE',
  actualPaidKgs: amountKgs,
  amountKgs,
});

describe('resolveSupplierPaymentDisplayStatus', () => {
  it('returns UNPAID when nothing is paid', () => {
    assert.equal(
      resolveSupplierPaymentDisplayStatus({
        paidAmountKgs: 0,
        orderTotalKgs: ORDER_TOTAL,
      }),
      'UNPAID',
    );
  });

  it('returns PARTIALLY_PAID for partial supplier payment', () => {
    assert.equal(
      resolveSupplierPaymentDisplayStatus({
        paidAmountKgs: PARTIAL_PAID,
        orderTotalKgs: ORDER_TOTAL,
      }),
      'PARTIALLY_PAID',
    );
  });

  it('returns PAID when the full order amount is paid', () => {
    assert.equal(
      resolveSupplierPaymentDisplayStatus({
        paidAmountKgs: FULL_PAID,
        orderTotalKgs: ORDER_TOTAL,
      }),
      'PAID',
    );
  });
});

describe('buildPurchaseOrderSupplierPaymentSummary', () => {
  it('uses confirmed supplier payments and purchase order total in KGS', () => {
    const summary = buildPurchaseOrderSupplierPaymentSummary({
      estimatedSupplierCostKgs: ORDER_TOTAL,
      supplierPayments: [confirmedPayment(PARTIAL_PAID)],
    });

    assert.equal(summary.orderTotalKgs, ORDER_TOTAL);
    assert.equal(summary.paidAmountKgs, PARTIAL_PAID);
    assert.equal(summary.remainingToPayKgs, 70_000);
    assert.equal(summary.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(
      summary.statusTranslationKey,
      getSupplierPaymentStatusTranslationKey('PARTIALLY_PAID'),
    );
  });

  it('returns the same status for all three UI consumers', () => {
    const scenarios = [
      { payments: [], expected: 'UNPAID' as const },
      { payments: [confirmedPayment(PARTIAL_PAID)], expected: 'PARTIALLY_PAID' as const },
      { payments: [confirmedPayment(FULL_PAID)], expected: 'PAID' as const },
    ];

    for (const scenario of scenarios) {
      const summary = buildPurchaseOrderSupplierPaymentSummary({
        estimatedSupplierCostKgs: ORDER_TOTAL,
        supplierPayments: scenario.payments,
      });
      assert.equal(summary.paymentStatus, scenario.expected);
    }
  });
});

describe('getSupplierPaymentProgressStepState', () => {
  it('keeps the payment step inactive when unpaid', () => {
    assert.equal(getSupplierPaymentProgressStepState('UNPAID'), 'unavailable');
  });

  it('marks the payment step completed for partial and full payment', () => {
    assert.equal(getSupplierPaymentProgressStepState('PARTIALLY_PAID'), 'completed');
    assert.equal(getSupplierPaymentProgressStepState('PAID'), 'completed');
  });
});

describe('resolveSupplierPaymentRemainingKgs', () => {
  it('keeps remaining supplier debt accurate for partial payments', () => {
    assert.equal(
      resolveSupplierPaymentRemainingKgs({
        orderTotalKgs: ORDER_TOTAL,
        paidAmountKgs: PARTIAL_PAID,
      }),
      70_000,
    );
  });

  it('returns zero remaining when fully paid', () => {
    assert.equal(
      resolveSupplierPaymentRemainingKgs({
        orderTotalKgs: ORDER_TOTAL,
        paidAmountKgs: FULL_PAID,
      }),
      0,
    );
  });
});
