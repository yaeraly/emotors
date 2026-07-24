import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getSupplierPaymentStatusLabel,
  resolveFinancialSupplierPaymentDisplayStatus,
  resolveSupplierPaymentRemainingKgs,
  resolveSupplyManagerSupplierPaymentDisplayStatus,
} from './supplier-payment-utils';

const ORDER_TOTAL = 100_000;
const PARTIAL_PAID = 30_000;
const FULL_PAID = 100_000;

describe('getSupplierPaymentStatusLabel', () => {
  it('shows unpaid for all roles when no payment exists', () => {
    for (const userRole of ['SUPPLY_CHAIN_MANAGER', 'ACCOUNTANT', 'CASHIER', 'FINANCIAL'] as const) {
      assert.equal(
        getSupplierPaymentStatusLabel({
          actualPaymentStatus: 'UNPAID',
          userRole,
          paidAmountKgs: 0,
          orderTotalKgs: ORDER_TOTAL,
        }),
        'UNPAID',
      );
    }
  });

  it('shows simplified paid status for Supply Manager on partial payment', () => {
    assert.equal(
      getSupplierPaymentStatusLabel({
        actualPaymentStatus: 'PARTIALLY_PAID',
        userRole: 'SUPPLY_CHAIN_MANAGER',
        paidAmountKgs: PARTIAL_PAID,
        orderTotalKgs: ORDER_TOTAL,
      }),
      'PAID',
    );
  });

  it('shows partial financial status for Accountant and Cashier', () => {
    for (const userRole of ['ACCOUNTANT', 'CASHIER', 'FINANCIAL'] as const) {
      assert.equal(
        getSupplierPaymentStatusLabel({
          actualPaymentStatus: 'PARTIALLY_PAID',
          userRole,
          paidAmountKgs: PARTIAL_PAID,
          orderTotalKgs: ORDER_TOTAL,
        }),
        'PARTIALLY_PAID',
      );
    }
  });

  it('shows paid for all roles when the order is fully paid', () => {
    for (const userRole of ['SUPPLY_CHAIN_MANAGER', 'ACCOUNTANT', 'CASHIER', 'FINANCIAL'] as const) {
      assert.equal(
        getSupplierPaymentStatusLabel({
          actualPaymentStatus: 'PAID',
          userRole,
          paidAmountKgs: FULL_PAID,
          orderTotalKgs: ORDER_TOTAL,
        }),
        'PAID',
      );
    }
  });

  it('does not remap stored partial status for financial roles when amounts are partial', () => {
    assert.equal(
      resolveFinancialSupplierPaymentDisplayStatus({
        paidAmountKgs: PARTIAL_PAID,
        orderTotalKgs: ORDER_TOTAL,
      }),
      'PARTIALLY_PAID',
    );
    assert.equal(
      resolveSupplyManagerSupplierPaymentDisplayStatus(PARTIAL_PAID),
      'PAID',
    );
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
