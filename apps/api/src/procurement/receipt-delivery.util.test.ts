import assert from 'node:assert/strict';
import {
  buildReceiptDeliveryMessage,
  canViewInvoiceReceipts,
  resolveInvoiceCreatorUserId,
} from './receipt-delivery.util';

const creator = { id: 'creator-1', role: 'SUPPLY_CHAIN_MANAGER' as const, roles: ['SUPPLY_CHAIN_MANAGER'] as const, branchId: null };
const cashier = { id: 'cashier-1', role: 'HQ_CASHIER' as const, roles: ['HQ_CASHIER'] as const, branchId: null };
const outsider = { id: 'outsider-1', role: 'MANAGER' as const, roles: ['MANAGER'] as const, branchId: 'branch-1' };

assert.equal(
  resolveInvoiceCreatorUserId({
    invoiceSentById: 'invoice-sender',
    orderCreatedById: 'order-creator',
    paymentCreatedById: 'payment-creator',
  }),
  'invoice-sender',
);

assert.equal(
  resolveInvoiceCreatorUserId({
    orderCreatedById: 'order-creator',
    expenseCreatedById: 'expense-creator',
  }),
  'order-creator',
);

const message = buildReceiptDeliveryMessage('INV-1001');
assert.equal(message.title, 'Квитанция загружена.');
assert.match(message.message, /INV-1001/);

assert.equal(canViewInvoiceReceipts(creator as never, 'creator-1'), true);
assert.equal(canViewInvoiceReceipts(creator as never, 'other-user'), false);
assert.equal(canViewInvoiceReceipts(cashier as never, 'other-user'), true);
assert.equal(canViewInvoiceReceipts(outsider as never, 'creator-1'), false);

console.log('receipt-delivery.util.test.ts: all assertions passed');
