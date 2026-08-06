import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceiptDeliveryMessage,
  canViewInvoiceReceipts,
  resolveInvoiceCreatorUserId,
} from './receipt-delivery.util';

const creator = {
  id: 'creator-1',
  role: 'SUPPLY_CHAIN_MANAGER' as const,
  roles: ['SUPPLY_CHAIN_MANAGER'] as const,
  branchId: null,
};
const cashier = {
  id: 'cashier-1',
  role: 'HQ_CASHIER' as const,
  roles: ['HQ_CASHIER'] as const,
  branchId: null,
};
const approver = {
  id: 'approver-1',
  role: 'HQ_ACCOUNTANT' as const,
  roles: ['HQ_ACCOUNTANT'] as const,
  branchId: null,
};
const outsider = {
  id: 'outsider-1',
  role: 'MANAGER' as const,
  roles: ['MANAGER'] as const,
  branchId: 'branch-1',
};

describe('receipt-delivery.util', () => {
  it('prefers order creator over invoice forwarder and approver', () => {
    assert.equal(
      resolveInvoiceCreatorUserId({
        invoiceSentById: 'invoice-forwarder',
        orderCreatedById: 'order-creator',
        paymentCreatedById: 'payment-creator',
      }),
      'order-creator',
    );
    assert.equal(
      resolveInvoiceCreatorUserId({
        orderCreatedById: 'order-creator',
        expenseCreatedById: 'expense-creator',
      }),
      'order-creator',
    );
  });

  it('falls back to expense or transfer creator when order creator is absent', () => {
    assert.equal(
      resolveInvoiceCreatorUserId({
        expenseCreatedById: 'expense-creator',
        invoiceSentById: 'invoice-forwarder',
      }),
      'expense-creator',
    );
    assert.equal(
      resolveInvoiceCreatorUserId({ transferCreatedById: 'transfer-creator' }),
      'transfer-creator',
    );
  });

  it('builds partial and final payment notification copy', () => {
    const partial = buildReceiptDeliveryMessage({
      invoiceNumber: 'INV-1001',
      paymentAmount: 50000,
      paymentCurrency: 'KGS',
      paymentStatus: 'PARTIALLY_PAID',
      isPartialPayment: true,
      isFullyPaid: false,
    });
    assert.match(partial.message, /INV-1001/);
    assert.match(partial.message, /50.?000/);
    assert.match(partial.message, /Частичный платёж принят/);

    const finalCopy = buildReceiptDeliveryMessage({
      invoiceNumber: 'INV-1001',
      paymentAmount: 150000,
      paymentCurrency: 'KGS',
      paymentStatus: 'PAID',
      isPartialPayment: false,
      isFullyPaid: true,
    });
    assert.match(finalCopy.message, /Счёт полностью оплачен/);
  });

  it('enforces creator and cashier receipt access', () => {
    assert.equal(canViewInvoiceReceipts(creator as never, 'creator-1'), true);
    assert.equal(canViewInvoiceReceipts(creator as never, 'other-user'), false);
    assert.equal(canViewInvoiceReceipts(cashier as never, 'other-user'), true);
    assert.equal(canViewInvoiceReceipts(approver as never, 'creator-1'), false);
    assert.equal(canViewInvoiceReceipts(outsider as never, 'creator-1'), false);
  });
});
