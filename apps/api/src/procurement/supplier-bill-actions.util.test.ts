/**
 * HQ Accountant supplier bill actions — visibility, return, postpone, costing.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getSupplierBillActionVisibility,
  resolveSupplierApprovalStatus,
} from './supplier-bill-actions.util';
import {
  isSupplierInvoiceAccountantProcessed,
} from './hq-receiving-validation.util';
import {
  isSupplierPaymentApprovedForLandedCost,
} from './procurement-cost.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);
const supplierService = readFileSync(join(__dirname, './supplier-payment-workflow.service.ts'), 'utf8');
const billsService = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');

// 1. Waiting supplier payment shows all four actions
const waiting = getSupplierBillActionVisibility({
  uiStatus: 'AWAITING_ACCOUNTANT',
  paidAmount: 0,
  remainingAmount: 800000,
});
assert(waiting.showPayFull && waiting.showPartial && waiting.showPostpone && waiting.showReturnForCorrection, '1. four actions');

// 2-4. Partially paid
const partial = getSupplierBillActionVisibility({
  uiStatus: 'PARTIALLY_PAID',
  paidAmount: 300000,
  remainingAmount: 500000,
});
assert(partial.showPayRemainder && partial.showPartial && partial.showPostpone, '2. partial actions');
assert(!partial.showReturnForCorrection, '2. no return with payments');

// 5. Postponed
const postponed = getSupplierBillActionVisibility({
  uiStatus: 'PAYMENT_POSTPONED',
  paidAmount: 0,
  remainingAmount: 800000,
});
assert(postponed.showPayFull && postponed.showChangePostponeDate, '5. postponed actions');

// 6-8. Backend pay instruction path
assert(supplierService.includes('payByAccountant'), '6. payByAccountant exists');
const payBlock = supplierService.slice(
  supplierService.indexOf('payByAccountant'),
  supplierService.indexOf('returnForCorrectionByAccountant'),
);
assert(payBlock.includes('PENDING_CASHIER'), '6. creates cashier instruction');
assert(!payBlock.includes('postLedgerEntry'), '7. no ledger at accountant');

// 9. Return allows confirmed payments; ledger still blocks irreversible finance
assert(supplierService.includes('returnForCorrectionByAccountant'), '9. dedicated return');
assert(supplierService.includes('invalidateStaleSupplierPaymentRequestsInTx'), '9. stale requests invalidated');
assert(!supplierService.includes('paidKgs > 0.009'), '9. partial paid return allowed');

// 10. Postpone no ledger
const postponeSection = billsService.slice(
  billsService.indexOf('async postponePayment'),
  billsService.indexOf('async permanentlyDelete'),
);
assert(!postponeSection.includes('postLedgerEntry'), '10. postpone no ledger');
assert(postponeSection.includes('SUPPLIER_PAYMENT_POSTPONED'), '10. supplier postpone audit');

// 11. Frontend shares visibility helper and payment modal
assert(page.includes('getCargoBillActionVisibility'), '11. shared visibility helper');
assert(page.includes("requestType === 'SUPPLIER_PAYMENT'"), '11. supplier payment flow');
assert(!page.includes('cargoConfirm'), '11. no second confirmation');

// 12. Costing uses full approved amount
assert(
  isSupplierPaymentApprovedForLandedCost({
    invoiceSentToAccountantAt: new Date(),
    supplierInvoiceNumber: 'INV-1',
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'PARTIALLY_PAID',
  }),
  '12. partial included in cost',
);
assert(
  isSupplierPaymentApprovedForLandedCost({
    invoiceSentToAccountantAt: new Date(),
    supplierInvoiceNumber: 'INV-1',
    invoiceReviewStatus: 'APPROVED',
    supplierPaymentStatus: 'PAYMENT_POSTPONED',
  }),
  '12. postponed included in cost',
);
assert(
  !isSupplierPaymentApprovedForLandedCost({
    invoiceSentToAccountantAt: new Date(),
    supplierInvoiceNumber: 'INV-1',
    invoiceReviewStatus: 'RETURNED',
    supplierPaymentStatus: 'AWAITING_ACCOUNTANT',
  }),
  '12. returned excluded',
);

// 13. Warehouse readiness
assert(isSupplierInvoiceAccountantProcessed({ supplierPaymentStatus: 'PARTIALLY_PAID' }), '13. partial processed');
assert(isSupplierInvoiceAccountantProcessed({ supplierPaymentStatus: 'PAYMENT_POSTPONED' }), '13. postponed processed');

// 14. Approval status
assert(
  resolveSupplierApprovalStatus({ invoiceReviewStatus: 'RETURNED', supplierPaymentStatus: 'AWAITING_ACCOUNTANT' }) ===
    'RETURNED_FOR_CORRECTION',
  '14. returned approval status',
);

// 15. Idempotency
assert(payBlock.includes('idempotencyKey'), '15. pay idempotency');
assert(supplierService.includes('Счет уже отправлен HQ Cashier.'), '15. duplicate instruction blocked');

console.log('supplier-bill-actions.util.test.ts passed');
