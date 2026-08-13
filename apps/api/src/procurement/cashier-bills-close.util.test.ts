import { readFileSync } from 'fs';
import { join } from 'path';
import { serializeCashierBillCloseResponse, toJsonSafe } from './cashier-bills-close.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const service = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const controller = readFileSync(join(__dirname, './procurement.controller.ts'), 'utf8');
const cashierPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/cashier-bills/page.tsx'),
  'utf8',
);
const api = readFileSync(join(__dirname, '../../../web/src/lib/api.ts'), 'utf8');

assert(service.includes('HQ_CASHIER_INVOICE_CLOSE_STARTED'), 'audit: close started');
assert(service.includes('HQ_CASHIER_INVOICE_CLOSED'), 'audit: close completed');
assert(service.includes('HQ_CASHIER_INVOICE_CLOSE_FAILED'), 'audit: close failed');
assert(service.includes('serializeCashierBillCloseResponse'), 'serialized close response');
assert(!service.includes('result,\n    };'), 'duplicate nested result removed from supplier close');
assert(!service.match(/result,\s*\n\s*\};\s*\n\s*\}\s*\n\s*private async failSupplierPayment/s), 'duplicate nested result removed from transport close');

assert(controller.includes("cashier-bills/:source/:id/confirm"), 'confirm endpoint exists');
assert(cashierPage.includes('apiUpload'), 'frontend uses apiUpload for receipt');
assert(cashierPage.includes("form.append('file', file)"), 'receipt field name is file');
assert(api.includes('Authorization'), 'authenticated API wrapper attaches bearer token');
assert(api.includes('UPLOAD_TIMEOUT_MS'), 'upload timeout configured');

const serialized = serializeCashierBillCloseResponse({
  id: 'pay-1',
  source: 'SUPPLIER_PAYMENT',
  executionStatus: 'COMPLETED',
  payment: {
    id: 'pay-1',
    status: 'ACTIVE',
    actualPaidKgs: 50000,
    exchangeRate: 12.5,
    actualFinanceAccount: { availableBalance: 100000 },
  },
  invoice: {
    id: 'order-1',
    supplierPaymentStatus: 'PARTIALLY_PAID',
    remainingYuan: 1000,
    weightedAverageYuanRate: 12.5,
  },
  receiptAttachment: { id: 'att-1', fileName: 'receipt.pdf', fileUrl: '/uploads/procurement/a.pdf' },
  receiptAttachments: [{ id: 'att-1', fileName: 'receipt.pdf', fileUrl: '/uploads/procurement/a.pdf' }],
  creatorNotification: { id: 'n1' },
});

assertEqual(serialized.id, 'pay-1', 'response id');
assertEqual(serialized.paymentStatus, 'PARTIALLY_PAID', 'payment status');
assertEqual(serialized.remainingAmount, 12500, 'remaining amount in KGS');
assertEqual(serialized.updatedAccountBalance, 100000, 'account balance');
assertEqual(serialized.receiptAttachment?.id, 'att-1', 'receipt attachment');
assert(!('result' in serialized), 'no duplicate result key');

const transportSerialized = serializeCashierBillCloseResponse({
  id: 'te-1',
  source: 'TRANSPORT_EXPENSE',
  executionStatus: 'PENDING_EXECUTION',
  payment: { id: 'te-1', status: 'PARTIALLY_PAID', paidAmountKgs: 50000 },
  invoice: { id: 'te-1', status: 'PARTIALLY_PAID', amountKgs: 150000, paidAmountKgs: 50000 },
  receiptAttachments: [],
});

assertEqual(transportSerialized.remainingAmount, 100000, 'transport remaining amount');
assertEqual(transportSerialized.paymentStatus, 'PARTIALLY_PAID', 'transport status');

const bigintSafe = toJsonSafe({ value: BigInt(42) });
assertEqual((bigintSafe as { value: string }).value, '42', 'bigint serialization');

console.log('cashier-bills-close.util.test.ts: all assertions passed');
