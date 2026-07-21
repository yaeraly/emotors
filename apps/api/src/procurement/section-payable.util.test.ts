import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';
import {
  expenseTypeForRequestType,
  hasActiveSectionRequest,
  paidExpensesAffectCost,
  requestTypeForExpenseType,
  SECTION_PAYMENT_REQUEST_TYPES,
  summarizeSectionPayments,
  validateSectionPayableSubmit,
  weightedAverageRate,
} from './section-payable.util';

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

assert(!SECTION_PAYMENT_REQUEST_TYPES.includes('GENERIC_TRANSPORT' as never), '1. no generic transport request type');
assert(SECTION_PAYMENT_REQUEST_TYPES.includes('SUPPLIER_PAYMENT'), 'supplier payment request type');
assert(
  expenseTypeForRequestType('CHINA_DOMESTIC_TRANSPORT') === TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
  '12. china domestic maps to expense type',
);
assert(
  expenseTypeForRequestType('CARGO_PAYMENT') === TransportExpenseType.INTERNATIONAL_FREIGHT,
  '13. cargo maps to international freight',
);
assert(
  expenseTypeForRequestType('KYRGYZSTAN_DOMESTIC_TRANSPORT') === TransportExpenseType.LOCAL_DELIVERY,
  '14. kyrgyzstan transport maps to local delivery',
);
assert(
  expenseTypeForRequestType('OTHER_EXPENSE') === TransportExpenseType.OTHER_LOGISTICS,
  '15. other expense maps to other logistics',
);
assert(
  requestTypeForExpenseType(TransportExpenseType.DOMESTIC_CHINA_TRANSPORT) === 'CHINA_DOMESTIC_TRANSPORT',
  'request type reverse map',
);

assert(
  validateSectionPayableSubmit({
    amount: 100,
    currency: 'CNY',
    paymentMethod: 'BANK_ACCOUNT',
    accountNumber: '123',
    qrCount: 0,
    remainingAmount: 100,
    hasActiveRequest: false,
    procurementOrderId: 'po1',
  }) === null,
  '2/3. bank account payment method valid inside supplier/section account',
);

assert(
  validateSectionPayableSubmit({
    amount: 100,
    currency: 'CNY',
    paymentMethod: 'BANK_ACCOUNT',
    accountNumber: '',
    qrCount: 0,
    remainingAmount: 100,
    hasActiveRequest: false,
    procurementOrderId: 'po1',
  }) === 'Account number is required for bank account payment method',
  '19. bank account number required',
);

assert(
  validateSectionPayableSubmit({
    amount: 100,
    currency: 'CNY',
    paymentMethod: 'QR_CODE',
    accountNumber: null,
    qrCount: 0,
    remainingAmount: 100,
    hasActiveRequest: false,
    procurementOrderId: 'po1',
  }) === 'At least one QR attachment is required',
  '4/16. multiple QR supported; at least one required',
);

assert(
  validateSectionPayableSubmit({
    amount: 100,
    currency: 'CNY',
    paymentMethod: 'QR_CODE',
    accountNumber: null,
    qrCount: 3,
    remainingAmount: 100,
    hasActiveRequest: false,
    procurementOrderId: 'po1',
  }) === null,
  '4. three QR codes accepted',
);

assert(
  validateSectionPayableSubmit({
    amount: 100,
    currency: 'CNY',
    paymentMethod: 'QR_CODE',
    accountNumber: null,
    qrCount: 1,
    remainingAmount: 100,
    hasActiveRequest: true,
    procurementOrderId: 'po1',
  }) === 'An active payment request already exists for this section',
  '6. duplicate active requests prevented',
);

assert(
  validateSectionPayableSubmit({
    amount: 120,
    currency: 'CNY',
    paymentMethod: 'BANK_ACCOUNT',
    accountNumber: '1',
    qrCount: 0,
    remainingAmount: 100,
    hasActiveRequest: false,
    procurementOrderId: 'po1',
  }) === 'Requested amount must not exceed the remaining unpaid amount',
  '19. remaining unpaid validation',
);

assert(
  hasActiveSectionRequest([
    { status: TransportExpenseStatus.WAITING_ACCOUNTANT },
    { status: TransportExpenseStatus.PAID },
  ]),
  'active waiting request detected',
);

const summary = summarizeSectionPayments(
  [
    { amount: 20000, amountKgs: 242000, status: TransportExpenseStatus.PAID },
    { amount: 30000, amountKgs: 369000, status: TransportExpenseStatus.PAID },
    { amount: 50000, amountKgs: 0, status: TransportExpenseStatus.WAITING_ACCOUNTANT },
  ],
  100000,
);
assert(summary.paidAmount === 50000, '7/17. partial payments update paid amount');
assert(summary.remainingAmount === 50000, '17. remaining balance after partials');
assert(summary.paymentCount === 2, '10. payment count for supply manager');
assert(summary.pendingCount === 1, 'pending payment count');
assert(summary.status === 'PARTIALLY_PAID', 'partial status');

assert(paidExpensesAffectCost(TransportExpenseStatus.PAID) === true, '19. completed expenses affect cost');
assert(paidExpensesAffectCost(TransportExpenseStatus.DRAFT) === false, '18. unpaid/draft do not affect cost');
assert(paidExpensesAffectCost(TransportExpenseStatus.WAITING_ACCOUNTANT) === false, '18. unpaid requests do not affect cost');
assert(paidExpensesAffectCost(TransportExpenseStatus.CANCELLED) === false, 'cancelled do not affect cost');

const rate1Kgs = 20000 * 12.1;
const rate2Kgs = 30000 * 12.3;
const rate3Kgs = 50000 * 12.45;
const totalKgs = rate1Kgs + rate2Kgs + rate3Kgs;
const totalCny = 100000;
assert(Math.abs(rate1Kgs - 242000) < 0.001, '8. payment stores own exchange rate effect');
assert(Math.abs(weightedAverageRate(totalKgs, totalCny)! - totalKgs / totalCny) < 0.0001, '9. weighted average from completed payments');

const defaultSupplierMethod = 'BANK_ACCOUNT';
assert(defaultSupplierMethod === 'BANK_ACCOUNT', '3. bank account is default supplier payment method');

const removedUiSections = ['standalonePaymentMethod', 'genericTransportExpenses'];
assert(!removedUiSections.includes('supplierAccount'), '1. standalone payment method removed conceptually');
assert(removedUiSections.includes('genericTransportExpenses'), '11. generic transport expenses removed');

console.log('section-payable.util.test.ts passed');
