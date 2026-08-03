import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFullPaymentRows,
  canFinalizeFullPaymentSale,
  computeFullPaymentChange,
  resolveFullPaymentReceivedAmount,
  shouldUseBranchCashierFullPaymentFlow,
  syncFullPaymentRowsOnTotalChange,
  validateFullPaymentReceivedAmount,
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

  it('keeps received amount editable after auto-fill', () => {
    const rows = buildFullPaymentRows(100_000);
    rows[0] = { ...rows[0]!, amount: '105000', cashReceived: '105000' };
    assert.equal(resolveFullPaymentReceivedAmount(rows), 105_000);
    assert.equal(computeFullPaymentChange(100_000, 105_000).changeAmount, 5_000);
  });

  it('updates auto-filled amount when sale total changes before manual edit', () => {
    const synced = syncFullPaymentRowsOnTotalChange(buildFullPaymentRows(100_000), 150_000, false);
    assert.equal(resolveFullPaymentReceivedAmount(synced), 150_000);
  });

  it('preserves manually entered amount when sale total changes', () => {
    const manual = buildFullPaymentRows(100_000);
    manual[0] = { ...manual[0]!, amount: '105000', cashReceived: '105000' };
    const synced = syncFullPaymentRowsOnTotalChange(manual, 150_000, true);
    assert.equal(resolveFullPaymentReceivedAmount(synced), 105_000);
    assert.equal(validateFullPaymentReceivedAmount(150_000, 105_000).ok, false);
  });

  it('accepts exact and overpayment amounts', () => {
    assert.equal(validateFullPaymentReceivedAmount(100_000, 100_000).ok, true);
    assert.equal(validateFullPaymentReceivedAmount(100_000, 120_000).ok, true);
  });

  it('rejects underpayment for full payment', () => {
    const result = validateFullPaymentReceivedAmount(100_000, 80_000);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.messageKey, 'sales.fullPaymentUnderpayment');
    }
  });

  it('uses cashier handoff flow for branch sales manager without cashier capability', () => {
    assert.equal(shouldUseBranchCashierFullPaymentFlow(branchSalesManager), true);
  });

  it('requires valid received amount for cashier handoff finalize', () => {
    assert.equal(
      canFinalizeFullPaymentSale({
        user: branchSalesManager,
        paymentType: 'FULL_PAYMENT',
        totalAmount: 120_000,
        receivedAmount: 120_000,
        hasBlockingPriceError: false,
        hasMissingPricing: false,
        paymentValidationOk: false,
        paymentComplete: false,
      }),
      true,
    );
    assert.equal(
      canFinalizeFullPaymentSale({
        user: branchSalesManager,
        paymentType: 'FULL_PAYMENT',
        totalAmount: 120_000,
        receivedAmount: 100_000,
        hasBlockingPriceError: false,
        hasMissingPricing: false,
        paymentValidationOk: false,
        paymentComplete: false,
      }),
      false,
    );
  });
});
