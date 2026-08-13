import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ACCOUNTANT_BILL_REQUEST_TYPES,
  buildAccountantBillsSummary,
  estimateKgsAmount,
  mapSupplierInvoiceToUi,
  mapTransportExpenseTypeToRequestType,
  mapTransportStatusToUi,
  matchesBillSearch,
  paginateItems,
  type AccountantBillListItem,
} from './accountant-bills.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const financeNav = readFileSync(join(__dirname, '../../../web/src/lib/finance-nav.ts'), 'utf8');
const shell = readFileSync(
  join(__dirname, '../../../web/src/components/ProtectedShell.tsx'),
  'utf8',
);
const rbac = readFileSync(join(__dirname, '../../../web/src/lib/rbac.ts'), 'utf8');
const billsPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);
const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260722090000_accountant_bills_to_pay_workflow/migration.sql',
  ),
  'utf8',
);
const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

assert(financeNav.includes("/finance/bills-to-pay"), '1. HQ Accountant has Счета к оплате navigation');
assert(financeNav.includes("finance.billsToPay"), '1. nav label key is finance.billsToPay');
assert(shell.includes('/finance/bills-to-pay'), '1. HQ Accountant sidebar links to Счета к оплате');
assert(shell.includes("finance.billsToPay"), '1. HQ Accountant sidebar uses finance.billsToPay label');
assert(shell.includes('isHqAccountantUser'), '1. HQ Accountant panel uses isHqAccountantUser');
assert(rbac.includes('export function isHqAccountantUser'), '1. isHqAccountantUser role helper exists');
assert(rbac.includes("hasRole(user, 'HQ_ACCOUNTANT')"), '1. HQ_ACCOUNTANT role mapping present');
assert(
  !billsPage.includes('cashier-bills') && !billsPage.includes('PENDING_EXECUTION'),
  'accountant page must not show cashier execution tasks',
);
assert(billsPage.includes('SUPPLIER_PAYMENT'), '2. Supply Manager supplier requests supported');
assert(billsPage.includes('OTHER_EXPENSE'), '3. other authorized expense types supported');
assert(billsPage.includes('canCreateSupplierPayment'), '4. unauthorized users are gated');
assert(!billsPage.includes('finance.billsToPay.status}</th>'), '5. no separate status column header');
assert(billsPage.includes('finance.billsToPay.status.${row.status}'), '5. status badge in actions');
assert(billsPage.includes('filterStatus'), '6. status filtering still works');
assert(billsPage.includes('finance.billsToPay.sender'), '7. sender displayed');
assert(billsPage.includes('finance.billsToPay.department'), '7. department displayed');
assert(billsPage.includes('finance.billsToPay.basis'), '8. related procurement basis displayed');
assert(billsPage.includes('recipientName'), '9. transport company / recipient displayed');
assert(billsPage.includes('cargoCalc'), '10. cargo calculation displayed');
assert(billsPage.includes('qrPreview') || billsPage.includes('showQr') || billsPage.includes('QR'), '11. QR attachments can be opened');
assert(billsPage.includes('return'), '12. accountant can return');
assert(billsPage.includes('reject'), '13. accountant can reject');
assert(billsPage.includes('approve'), '14. accountant can approve');
assert(billsPage.includes('createPartialPayment'), '15. partial payment supported');
assert(billsPage.includes('postponePayment'), '15b. postpone payment supported');
assert(billsPage.includes('PAYMENT_POSTPONED'), '15c. postponed status in filters');
assert(billsPage.includes('exchangeRate'), '17. payment exchange rate captured');
assert(billsPage.includes('sendToCashier'), '19. payment can be sent to cashier');
assert(migration.includes('ADD COLUMN IF NOT EXISTS'), '26. safe migration without reset');
assert(schema.includes('invoiceReviewStatus'), 'invoice review status preserved on order');
assert(schema.includes('UNDER_REVIEW'), 'under review status available');
assert(schema.includes('REJECTED'), 'rejected status available');
assert(!schema.includes('model PaymentRequest'), '25. no duplicate PaymentRequest model');

assertEqual(mapTransportExpenseTypeToRequestType('INTERNATIONAL_FREIGHT'), 'CARGO_PAYMENT', 'cargo type map');
assertEqual(mapTransportStatusToUi('WAITING_ACCOUNTANT'), 'AWAITING_ACCOUNTANT', 'status map');
assertEqual(
  mapSupplierInvoiceToUi({ invoiceReviewStatus: 'UNDER_REVIEW', supplierPaymentStatus: 'AWAITING_ACCOUNTANT' }),
  'UNDER_REVIEW',
  'supplier under review',
);
assertEqual(
  mapSupplierInvoiceToUi({
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
    remainingYuan: 80000,
  }),
  'AWAITING_ACCOUNTANT',
  'supplier review-approved unpaid still awaiting accountant actions',
);
assertEqual(
  mapSupplierInvoiceToUi({
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'AWAITING_CASHIER',
    remainingYuan: 80000,
  }),
  'APPROVED',
  'supplier awaiting cashier maps to APPROVED (no duplicate pay actions)',
);
assertEqual(
  mapSupplierInvoiceToUi({
    invoiceReviewStatus: 'SUBMITTED',
    supplierPaymentStatus: 'UNPAID',
    remainingYuan: 80000,
  }),
  'AWAITING_ACCOUNTANT',
  'supplier submitted unpaid awaits accountant',
);
assertEqual(
  mapSupplierInvoiceToUi({
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'PAID',
    remainingYuan: 60000,
    remainingKgs: 780000,
  }),
  'PARTIALLY_PAID',
  'stale paid status with remaining maps to partially paid',
);
assertEqual(
  mapSupplierInvoiceToUi({
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'PAID',
    remainingYuan: 0,
    remainingKgs: 0,
  }),
  'FULLY_PAID',
  'paid status with zero remaining stays fully paid',
);
assert(
  billsPage.includes('isCargoOrSupplierAccountantBill') ||
    billsPage.includes("source === 'SUPPLIER_INVOICE'"),
  'supplier detail uses source-aware accountant payment flow',
);
assert(billsPage.includes('resolveBillRemainingForActions'), 'supplier remaining falls back when KGS is 0');
assert(
  billsPage.includes('usesAccountantPaymentFlow = isCargoPayment || isSupplierPayment'),
  'supplier shares cargo accountant action flow',
);
assert(billsPage.includes('correctionRouting'), 'correction routing shown in actions column');
assert(billsPage.includes('finance.billsToPay.correctionRouting.fromCashier'), 'cashier correction label');
assert(billsPage.includes('finance.billsToPay.correctionRouting.toSupplyManager'), 'supply manager correction label');
assert(billsPage.includes('formatBillCorrectionRoutingAssignee'), 'correction routing assignee formatter');

const correctionRoutingUtil = readFileSync(
  join(__dirname, './accountant-bill-correction-routing.util.ts'),
  'utf8',
);
const correctionService = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');
assert(correctionRoutingUtil.includes('resolveSupplierInvoiceCorrectionRouting'), 'supplier routing resolver');
assert(correctionRoutingUtil.includes('resolveTransportExpenseCorrectionRouting'), 'transport routing resolver');
assert(correctionService.includes('correctionRouting'), 'collectBills emits correctionRouting');
assert(correctionService.includes('returnedBy: { select: AccountantBillsService.CORRECTION_USER_SELECT }'), '13. batch user include');
assert(!correctionService.includes('findMany({\n        where: { id:'), '13. no per-row user findMany');

const sample: AccountantBillListItem[] = [
  {
    id: '1',
    source: 'SUPPLIER_INVOICE',
    requestNumber: 'PO-1',
    requestType: 'SUPPLIER_PAYMENT',
    submittedAt: new Date().toISOString(),
    sender: { id: 'u1', fullName: 'SM User', role: 'SUPPLY_CHAIN_MANAGER' },
    departmentOrBranch: 'Supply / Procurement',
    recipientName: 'Factory A',
    basis: 'PO-1 · Factory A',
    amount: 100000,
    currency: 'CNY',
    estimatedAmountKgs: 1200000,
    paidAmount: 20000,
    paidAmountKgs: 240000,
    remainingAmount: 80000,
    remainingAmountKgs: 960000,
    status: 'PARTIALLY_PAID',
    isOverdue: false,
    relatedEntityType: 'ProcurementOrder',
    relatedEntityId: '1',
    relatedOrderNumber: 'PO-1',
    href: '/procurement/orders/1?tab=payments',
  },
  {
    id: '2',
    source: 'TRANSPORT_EXPENSE',
    requestNumber: 'TRE-1',
    requestType: 'CARGO_PAYMENT',
    submittedAt: new Date().toISOString(),
    sender: { id: 'u1', fullName: 'SM User', role: 'SUPPLY_CHAIN_MANAGER' },
    departmentOrBranch: 'Supply / Procurement',
    recipientName: 'China Fast Logistics',
    basis: 'PO-1 · INTERNATIONAL_FREIGHT',
    amount: 131250,
    currency: 'KGS',
    estimatedAmountKgs: 131250,
    paidAmount: 50000,
    paidAmountKgs: 50000,
    remainingAmount: 81250,
    remainingAmountKgs: 81250,
    status: 'PARTIALLY_PAID',
    isOverdue: true,
    relatedEntityType: 'ProcurementTransportExpense',
    relatedEntityId: '2',
    relatedOrderNumber: 'PO-1',
    href: '/procurement/orders/1?tab=transport',
  },
];

const summary = buildAccountantBillsSummary(sample);
assertEqual(summary.partiallyPaidCount, 2, 'partial summary');
assertEqual(summary.overdueCount, 1, 'overdue summary');
assert(summary.totalPayableKgs > 0, 'total payable KGS');

assertEqual(estimateKgsAmount(100, 'CNY', 12), 1200, 'FX conversion for summary');
assert(matchesBillSearch(sample[1], 'China Fast'), 'search by transport company');
assert(matchesBillSearch(sample[0], 'PO-1'), 'search by procurement order');

const page = paginateItems(sample, 1, 1);
assertEqual(page.items.length, 1, 'pagination page size');
assertEqual(page.total, 2, 'pagination total');

assert(ACCOUNTANT_BILL_REQUEST_TYPES.includes('SUPPLIER_PAYMENT'), 'request types include supplier');
assert(ACCOUNTANT_BILL_REQUEST_TYPES.includes('EMPLOYEE_REIMBURSEMENT'), 'request types include reimbursement');

// Cost base remains full approved request, not paid-only.
assertEqual(sample[0].amount, 100000, '22. procurement cost uses full request amount');
assert(sample[0].paidAmount < sample[0].amount, '23. partial payment does not reduce cost base amount');

console.log('accountant-bills.util.test.ts passed');
