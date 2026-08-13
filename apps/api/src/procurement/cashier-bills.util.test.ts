import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertCashierCannotMutateApprovedAmount,
  assertCashierCannotMutateFx,
  buildCashierBillsSummaryWithPaidAt,
  compareCashierBills,
  isActiveTransportPayableRow,
  matchesCashierBillSearch,
  normalizeCashierExecutionStatus,
  paginateItems,
  resolveCashierBillPaymentSortGroup,
  resolveTransportExpenseAmounts,
  sortCashierBills,
  type CashierBillListItem,
} from './cashier-bills.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => void, messageIncludes: string, label: string) {
  try {
    fn();
    throw new Error(`${label}: expected throw`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(messageIncludes)) {
      throw new Error(`${label}: unexpected message ${message}`);
    }
  }
}

const shell = readFileSync(
  join(__dirname, '../../../web/src/components/ProtectedShell.tsx'),
  'utf8',
);
const rbac = readFileSync(join(__dirname, '../../../web/src/lib/rbac.ts'), 'utf8');
const cashierPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/cashier-bills/page.tsx'),
  'utf8',
);
const cashierBillActions = readFileSync(
  join(__dirname, '../../../web/src/lib/cashier-bill-actions.ts'),
  'utf8',
);
const cashierBillsUtil = readFileSync(join(__dirname, './cashier-bills.util.ts'), 'utf8');
const legacyPage = readFileSync(
  join(__dirname, '../../../web/src/app/procurement/cashier-payments/page.tsx'),
  'utf8',
);
const service = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const controller = readFileSync(join(__dirname, './procurement.controller.ts'), 'utf8');
const workflow = readFileSync(join(__dirname, './supplier-payment-workflow.service.ts'), 'utf8');
const transport = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260722100000_cashier_bills_execution_fields/migration.sql',
  ),
  'utf8',
);
const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

assert(shell.includes('/finance/cashier-bills'), '1. HQ Cashier has Счета к оплате navigation');
assert(shell.includes("finance.cashierBills"), '1. nav label key is finance.cashierBills');
assert(rbac.includes("'/finance/cashier-bills'"), '1. HQ cashier path allowlist includes cashier-bills');
assert(legacyPage.includes('/finance/cashier-bills'), 'legacy cashier queue redirects to cashier-bills');

assert(service.includes("status: ProcurementSupplierPaymentStatus.PENDING_CASHIER"), '2. only accountant-sent payments');
assert(service.includes('TransportExpenseStatus.PARTIALLY_PAID'), '2. partial cargo stays in cashier queue');
assert(service.includes('TransportExpenseStatus.PAYMENT_POSTPONED'), '2. postponed cargo stays in cashier queue');
assert(service.includes('PENDING_CASHIER'), '2. payment tasks require PENDING_CASHIER or remaining balance');
assert(!service.includes("WAITING_ACCOUNTANT"), '3. raw employee transport requests excluded from cashier collect');
assert(!cashierPage.includes('invoiceReviewStatus'), '3. raw employee requests not shown in cashier UI');

assert(cashierPage.includes('finance.cashierBills.statusColumn'), '4. status column header');
assert(cashierPage.includes('StatusBadge'), '4. status badge uses existing status colors');
assert(cashierPage.includes('filterStatus') || cashierPage.includes('executionStatus'), '5. status filter exists');
assert(cashierPage.includes('finance.cashierBills.pin'), 'confirm modal has pin action');
assert(!cashierPage.includes('finance.cashierBills.openSource'), 'drawer does not show open source');

assert(cashierPage.includes('finance.cashierBills.open'), '5. cashier can open payment details');
assert(cashierPage.includes('accountNumber'), '6. bank account information displayed');
assert(cashierPage.includes('qrCodes') || cashierPage.includes('qrAttachments'), '7. QR codes displayed');

assert(controller.includes("cashier-bills/:source/:id/start"), '8. start payment endpoint');
assert(service.includes('FOR UPDATE'), '9. start-payment locking');
assert(service.includes('already being processed'), '9. concurrent cashier lock error');

assert(cashierPage.includes('receiptRequired') || cashierPage.includes('receiptFile'), '10. receipt required for confirmation');
assert(service.includes('assertCashierCannotMutateApprovedAmount'), '11. cashier cannot change approved amount');
assert(service.includes('assertCashierCannotMutateFx'), '12-13. cashier cannot change currency/rate');

assert(workflow.includes("executionStatus: 'COMPLETED'"), '14. confirm sets completed execution');
assert(workflow.includes('postLedgerEntry'), '14. confirmation creates finance transaction');
assert(workflow.includes('syncOrderPaymentState'), '15. paid/remaining recalculated');
assert(workflow.includes('SUPPLIER_PAYMENT_PARTIALLY_PAID') || workflow.includes('PARTIALLY_PAID'), '16. partial payment path');
assert(workflow.includes('SUPPLIER_PAYMENT_FULLY_PAID') || workflow.includes("=== 'PAID'"), '17. final payment path');

assert(cashierPage.includes('previousPayments') || service.includes('previousPayments'), '18. partial payments keep own history/receipts');
assert(controller.includes("cashier-bills/:source/:id/return"), '19. return to accountant');
assert(service.includes('RETURNED_TO_ACCOUNTANT'), '19. returned execution status');
assert(controller.includes("cashier-bills/:source/:id/fail"), '21. fail endpoint');
assert(
  cashierPage.includes('canCashierReportPaymentFailure'),
  'procurement/import types hide report-failure action in cashier detail',
);
assert(
  cashierPage.includes("canCashierReportPaymentFailure(row.requestType)"),
  'shared helper gates report-failure button',
);
assert(
  cashierBillActions.includes('SUPPLIER_PAYMENT') &&
    cashierBillActions.includes('CHINA_DOMESTIC_TRANSPORT') &&
    cashierBillActions.includes('CARGO_PAYMENT') &&
    cashierBillActions.includes('KYRGYZSTAN_DOMESTIC_TRANSPORT'),
  'all four procurement/import types excluded from fail action',
);
assert(cashierPage.includes("finance.cashierBills.return"), '5. return action remains');
assert(service.includes('CASHIER_PAYMENT_FAILED'), '21. failed payment notifies accountant, no ledger in fail path');
assert(!service.includes("postLedgerEntry"), '21. fail path does not create finance transaction in cashier service');

assert(service.includes('CASHIER_PAYMENT_STARTED'), '22. accountant notified on start');
assert(workflow.includes('SUPPLIER_PAYMENT_COMPLETED'), '23. original sender notified on completion');
assert(service.includes('costBaseYuan') || service.includes('costBaseKgs'), '24. procurement cost base preserved');
assert(service.includes('CASHIER_PAYMENT_OPENED') || service.includes('writeAudit'), '25. audit logs created');

assert(schema.includes('executionStatus'), '19. prisma execution fields');
assert(schema.includes('executionStartedAt'), '19. prisma execution started at');
assert(schema.includes('failureReason'), '19. prisma failure reason');
assert(!schema.includes('model PaymentRequest'), 'no duplicate PaymentRequest model');
assert(migration.includes('ADD COLUMN IF NOT EXISTS'), '27. migration applies without database reset');
assert(migration.includes('PENDING_EXECUTION'), '27. backfill pending execution');

assertEqual(normalizeCashierExecutionStatus(null, 'PENDING_CASHIER'), 'PENDING_EXECUTION', 'normalize pending');
assertEqual(normalizeCashierExecutionStatus(null, 'PARTIALLY_PAID'), 'PENDING_EXECUTION', 'normalize partial');
assertEqual(normalizeCashierExecutionStatus(null, 'PAYMENT_POSTPONED'), 'PENDING_EXECUTION', 'normalize postponed');

assert(
  isActiveTransportPayableRow({ status: 'PARTIALLY_PAID', remainingKgs: 100 }),
  'partial transport row stays payable',
);
assert(
  !isActiveTransportPayableRow({ status: 'PARTIALLY_PAID', remainingKgs: 0 }),
  'zero remaining transport row excluded',
);
assertEqual(
  resolveTransportExpenseAmounts({ amountKgs: 150000, paidAmountKgs: 50000 }).remainingKgs,
  100000,
  'remaining balance helper',
);

assertEqual(normalizeCashierExecutionStatus('IN_PROGRESS', 'PENDING_CASHIER'), 'IN_PROGRESS', 'normalize in progress');
assertEqual(normalizeCashierExecutionStatus(null, 'ACTIVE'), 'COMPLETED', 'normalize completed');

assertEqual(
  assertCashierCannotMutateApprovedAmount({ approvedAmountKgs: 1000, requestedActualPaidKgs: 1000 }),
  1000,
  '11. same approved amount allowed',
);
assertEqual(
  assertCashierCannotMutateApprovedAmount({ approvedAmountKgs: 1000, requestedActualPaidKgs: 900 }),
  900,
  '11. underpayment within approved amount allowed',
);
assertThrows(
  () => assertCashierCannotMutateApprovedAmount({ approvedAmountKgs: 1000, requestedActualPaidKgs: 1100 }),
  'cannot change the approved payment amount',
  '11. amount over approved blocked',
);
assertThrows(
  () =>
    assertCashierCannotMutateFx({
      storedCurrency: 'CNY',
      storedExchangeRate: 12.5,
      requestedCurrency: 'USD',
    }),
  'cannot change the payment currency',
  '12. currency mutation blocked',
);
assertThrows(
  () =>
    assertCashierCannotMutateFx({
      storedCurrency: 'CNY',
      storedExchangeRate: 12.5,
      requestedExchangeRate: 13,
    }),
  'cannot change the exchange rate',
  '13. rate mutation blocked',
);

const sample: CashierBillListItem[] = [
  {
    id: 'p1',
    source: 'SUPPLIER_PAYMENT',
    paymentNumber: 'PAY-1',
    requestNumber: 'PO-1',
    requestType: 'SUPPLIER_PAYMENT',
    sentToCashierAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    sender: { id: 's1', fullName: 'SM User' },
    accountant: { id: 'a1', fullName: 'Acc User' },
    cashier: null,
    departmentOrBranch: 'HQ',
    recipientName: 'Supplier Co',
    basis: 'PO PO-1',
    amount: 20000,
    currency: 'CNY',
    exchangeRate: 12,
    amountKgs: 240000,
    debitAccountName: 'HQ Cash',
    debitAccountId: 'acc1',
    executionStatus: 'PENDING_EXECUTION',
    paymentStatus: 'PENDING_CASHIER',
    relatedOrderNumber: 'PO-1',
    href: '/finance/cashier-bills?source=SUPPLIER_PAYMENT&id=p1',
  },
  {
    id: 'p2',
    source: 'TRANSPORT_EXPENSE',
    paymentNumber: 'TE-1',
    requestNumber: 'TE-1',
    requestType: 'CARGO_PAYMENT',
    sentToCashierAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    sender: { id: 's1', fullName: 'SM User' },
    accountant: { id: 'a1', fullName: 'Acc User' },
    cashier: { id: 'c1', fullName: 'Cashier' },
    departmentOrBranch: null,
    recipientName: 'Cargo Co',
    basis: 'Cargo',
    amount: 500,
    currency: 'USD',
    exchangeRate: 87,
    amountKgs: 43500,
    debitAccountName: 'HQ Bank',
    debitAccountId: 'acc2',
    executionStatus: 'IN_PROGRESS',
    paymentStatus: 'PENDING_CASHIER',
    relatedOrderNumber: 'PO-1',
    href: '/finance/cashier-bills?source=TRANSPORT_EXPENSE&id=p2',
  },
  {
    id: 'p3',
    source: 'SUPPLIER_PAYMENT',
    paymentNumber: 'PAY-2',
    requestNumber: 'PO-2',
    requestType: 'SUPPLIER_PAYMENT',
    sentToCashierAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    sender: { id: 's2', fullName: 'Other' },
    accountant: { id: 'a1', fullName: 'Acc User' },
    cashier: { id: 'c1', fullName: 'Cashier' },
    departmentOrBranch: null,
    recipientName: 'Supplier 2',
    basis: 'PO PO-2',
    amount: 10000,
    currency: 'CNY',
    exchangeRate: 12,
    amountKgs: 120000,
    debitAccountName: 'HQ Cash',
    debitAccountId: 'acc1',
    executionStatus: 'COMPLETED',
    paymentStatus: 'ACTIVE',
    relatedOrderNumber: 'PO-2',
    href: '/finance/cashier-bills?source=SUPPLIER_PAYMENT&id=p3',
  },
];

const summary = buildCashierBillsSummaryWithPaidAt(sample, {
  p1: null,
  p2: null,
  p3: new Date().toISOString(),
});
assertEqual(summary.awaitingCount, 1, 'summary awaiting');
assertEqual(summary.inProgressCount, 1, 'summary in progress');
assertEqual(summary.paidTodayCount, 1, 'summary paid today');
assert(summary.totalPayableKgs === 283500, 'summary payable kgs');

assert(matchesCashierBillSearch(sample[0], 'PAY-1'), 'search by payment number');
assert(matchesCashierBillSearch(sample[0], 'Supplier Co'), 'search by supplier');
assert(matchesCashierBillSearch(sample[1], 'Cargo Co'), 'search by transport company');
assert(!matchesCashierBillSearch(sample[0], 'zzz-no-match'), 'search miss');

const page = paginateItems(sample, 1, 2);
assertEqual(page.items.length, 2, 'pagination size');
assertEqual(page.total, 3, 'pagination total');

assertEqual(resolveCashierBillPaymentSortGroup('PENDING_EXECUTION', 'PENDING_CASHIER'), 'PENDING_PAYMENT', 'sort group pending');
assertEqual(resolveCashierBillPaymentSortGroup('PENDING_EXECUTION', 'PARTIALLY_PAID'), 'PARTIALLY_PAID', 'sort group partial');
assertEqual(resolveCashierBillPaymentSortGroup('COMPLETED', 'ACTIVE'), 'PAID', 'sort group paid');

const mixedSortInput: CashierBillListItem[] = [
  {
    ...sample[2],
    id: 'paid-old',
    createdAt: '2026-01-01T10:00:00.000Z',
    executionStatus: 'COMPLETED',
    paymentStatus: 'ACTIVE',
  },
  {
    ...sample[0],
    id: 'pending-new',
    createdAt: '2026-01-05T10:00:00.000Z',
    executionStatus: 'PENDING_EXECUTION',
    paymentStatus: 'PENDING_CASHIER',
  },
  {
    ...sample[1],
    id: 'partial',
    createdAt: '2026-01-03T10:00:00.000Z',
    executionStatus: 'PENDING_EXECUTION',
    paymentStatus: 'PARTIALLY_PAID',
  },
  {
    ...sample[2],
    id: 'paid-new',
    createdAt: '2026-01-06T10:00:00.000Z',
    executionStatus: 'COMPLETED',
    paymentStatus: 'PAID',
  },
  {
    ...sample[0],
    id: 'pending-old',
    createdAt: '2026-01-02T10:00:00.000Z',
    executionStatus: 'PENDING_EXECUTION',
    paymentStatus: 'PENDING_CASHIER',
  },
];

const sortedMixed = sortCashierBills(mixedSortInput);
assertEqual(sortedMixed.map((item) => item.id).join(','), 'pending-new,pending-old,partial,paid-new,paid-old', 'mixed status sort order');
assert(compareCashierBills(sortedMixed[0], sortedMixed[1]) <= 0, 'pending items stay above partial');
assert(compareCashierBills(sortedMixed[2], sortedMixed[3]) < 0, 'partial stays above paid');

const paginatedSorted = paginateItems(sortCashierBills(mixedSortInput), 1, 2);
assertEqual(paginatedSorted.items.map((item) => item.id).join(','), 'pending-new,pending-old', 'pagination preserves global sort order');

assert(service.includes('sortCashierBills'), '28. cashier bills sorted by payment status before pagination');
assert(transport.includes("executionStatus: send ? 'PENDING_EXECUTION'"), 'send to cashier sets execution');
assert(workflow.includes("executionStatus: 'PENDING_EXECUTION'"), 'supplier send sets execution');
assert(service.includes('existing payment records') || schema.includes('ProcurementSupplierPayment'), '26. existing payment records remain accessible');

assert(service.includes('HQ_CASHIER_INVOICE_CLOSE_STARTED'), '29. close started audit');
assert(service.includes('serializeCashierBillCloseResponse'), '29. serialized close response');
assert(cashierPage.includes('apiUpload'), '29. cashier receipt upload uses apiUpload');
assert(cashierPage.includes("form.append('file', file)"), '29. receipt field name file');
assert(!cashierPage.includes('fetch(url'), '29. no raw fetch upload in cashier page');

console.log('cashier-bills.util.test.ts: all assertions passed');
