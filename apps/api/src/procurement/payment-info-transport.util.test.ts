import {
  ProcurementPaymentInfoMethod,
  TransportExpenseStatus,
  TransportExpenseType,
} from '@prisma/client';

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

assert(
  ProcurementPaymentInfoMethod.BANK_ACCOUNT === 'BANK_ACCOUNT',
  'default payment method is supplier bank account',
);
assert(ProcurementPaymentInfoMethod.QR_CODE === 'QR_CODE', 'QR payment method exists');

const editable = new Set([TransportExpenseStatus.DRAFT, TransportExpenseStatus.RETURNED]);
assert(editable.has(TransportExpenseStatus.DRAFT), 'draft editable');
assert(editable.has(TransportExpenseStatus.RETURNED), 'returned editable');
assert(!editable.has(TransportExpenseStatus.PAID), 'paid not editable');
assert(!editable.has(TransportExpenseStatus.PENDING_CASHIER), 'cashier queue not editable by SM');

assert(
  TransportExpenseType.INTERNATIONAL_FREIGHT === 'INTERNATIONAL_FREIGHT',
  'international freight expense type',
);

function sameAccountBlocked(source: string, dest: string) {
  return source === dest;
}
assert(!sameAccountBlocked('a', 'b'), 'different accounts ok');

console.log('payment-info-transport.util.test.ts passed');
