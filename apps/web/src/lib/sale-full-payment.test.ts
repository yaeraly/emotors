import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFullPaymentRows,
  canFinalizeFullPaymentSale,
  shouldUseBranchCashierFullPaymentFlow,
} from './sale-full-payment';

const branchSalesManager = {
  id: 'user-1',
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
  email: 'manager@example.com',
  fullName: 'Manager',
};

describe('sale full payment helpers', () => {
  it('auto-fills paid amount with the current full sale total', () => {
    const rows = buildFullPaymentRows(120_000);
    assert.equal(rows[0]?.amount, '120000');
    assert.equal(rows[0]?.cashReceived, '120000');
  });

  it('updates paid amount when sale total changes', () => {
    const rows = buildFullPaymentRows(99.5);
    assert.equal(rows[0]?.amount, '99.5');
  });

  it('uses cashier handoff flow for branch sales manager without cashier capability', () => {
    assert.equal(shouldUseBranchCashierFullPaymentFlow(branchSalesManager), true);
  });

  it('does not require payment-part validation for cashier handoff flow', () => {
    assert.equal(
      canFinalizeFullPaymentSale({
        user: branchSalesManager,
        paymentType: 'FULL_PAYMENT',
        totalAmount: 120_000,
        hasBlockingPriceError: false,
        hasMissingPricing: false,
        paymentValidationOk: false,
        paymentComplete: false,
      }),
      true,
    );
  });
});
