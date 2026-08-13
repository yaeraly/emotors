import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildReceiptDeliveryMessage,
  resolveInvoiceCreatorUserId,
} from './receipt-delivery.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const deliveryUtil = readFileSync(join(__dirname, './receipt-delivery.util.ts'), 'utf8');
const supplierService = readFileSync(join(__dirname, './supplier-payment-workflow.service.ts'), 'utf8');
const transportService = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const cashierService = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const panel = readFileSync(
  join(__dirname, '../../../web/src/components/InvoiceReceiptHistoryPanel.tsx'),
  'utf8',
);

assert(
  resolveInvoiceCreatorUserId({
    orderCreatedById: 'creator',
    invoiceSentById: 'forwarder',
  }) === 'creator',
  '1. original order creator preferred over forwarder',
);
assert(deliveryUtil.includes('findAlreadyDeliveredAttachmentIds'), '16. idempotent delivery guard');
assert(deliveryUtil.includes('PAYMENT_RECEIPT_SENT_TO_CREATOR'), '5. creator delivery audit');
assert(deliveryUtil.includes('INVOICE_RECEIPT_CREATOR_NOT_FOUND'), '17. missing creator audit');
assert(supplierService.includes('deliverReceiptsToCreatorInTx'), '5. supplier notify creator');
assert(transportService.includes('deliverReceiptsToCreatorInTx'), '10. transport notify creator');
assert(cashierService.includes('receiptAttachment'), 'API returns receipt attachment');
assert(cashierService.includes('creatorNotification'), 'API returns creator notification');
assert(panel.includes('invoice-receipts'), '7. creator receipt panel');
assert(panel.includes('/download'), '8. creator can download receipt');
assert(
  buildReceiptDeliveryMessage({
    invoiceNumber: 'INV-1',
    paymentAmount: 50000,
    isPartialPayment: true,
    isFullyPaid: false,
  }).message.includes('Частичный платёж принят'),
  '10. partial payment notification copy',
);

console.log('receipt-delivery.integration.util.test.ts passed');
