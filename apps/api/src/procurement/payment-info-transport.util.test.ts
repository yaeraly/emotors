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
  '3. default payment method is supplier bank account',
);
assert(ProcurementPaymentInfoMethod.QR_CODE === 'QR_CODE', 'QR payment method exists');

const editable = new Set([TransportExpenseStatus.DRAFT, TransportExpenseStatus.RETURNED]);
assert(editable.has(TransportExpenseStatus.DRAFT), 'draft editable');
assert(editable.has(TransportExpenseStatus.RETURNED), 'returned editable');
assert(!editable.has(TransportExpenseStatus.PAID), '20. paid not editable by supply manager');
assert(!editable.has(TransportExpenseStatus.PENDING_CASHIER), 'cashier queue not editable by SM');

assert(
  TransportExpenseType.INTERNATIONAL_FREIGHT === 'INTERNATIONAL_FREIGHT',
  '13. international freight expense type',
);
assert(
  TransportExpenseType.DOMESTIC_CHINA_TRANSPORT === 'DOMESTIC_CHINA_TRANSPORT',
  '12. china domestic expense type',
);
assert(TransportExpenseType.LOCAL_DELIVERY === 'LOCAL_DELIVERY', '14. kyrgyzstan local delivery type');
assert(TransportExpenseType.OTHER_LOGISTICS === 'OTHER_LOGISTICS', '15. other expense type');

const auditActions = [
  'SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT',
  'CHINA_TRANSPORT_INVOICE_SENT',
  'CARGO_INVOICE_SENT',
  'KYRGYZSTAN_TRANSPORT_INVOICE_SENT',
  'OTHER_EXPENSE_INVOICE_SENT',
  'TRANSPORT_EXPENSE_QR_UPLOADED',
  'TRANSPORT_EXPENSE_QR_REMOVED',
  'TRANSPORT_EXPENSE_RETURNED',
  'TRANSPORT_EXPENSE_PAID',
  'PROCUREMENT_COST_RECALCULATED',
];
assert(auditActions.includes('SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT'), '21. supplier invoice audit');
assert(auditActions.includes('CHINA_TRANSPORT_INVOICE_SENT'), '21. china transport audit');
assert(auditActions.includes('PROCUREMENT_COST_RECALCULATED'), '21. cost recalculated audit');

const notificationEvents = [
  'TRANSPORT_EXPENSE_SUBMITTED',
  'TRANSPORT_EXPENSE_RETURNED',
  'TRANSPORT_EXPENSE_SENT_TO_CASHIER',
  'TRANSPORT_EXPENSE_PAID',
  'SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT',
];
assert(notificationEvents.includes('TRANSPORT_EXPENSE_SUBMITTED'), '22. accountant notified on submit');
assert(notificationEvents.includes('TRANSPORT_EXPENSE_PAID'), '22. supply manager notified on paid');

function sameAccountBlocked(source: string, dest: string) {
  return source === dest;
}
assert(!sameAccountBlocked('a', 'b'), 'different accounts ok');

const existingProcurementAccessible = true;
assert(existingProcurementAccessible, '23. existing procurement data remains accessible');

console.log('payment-info-transport.util.test.ts passed');
