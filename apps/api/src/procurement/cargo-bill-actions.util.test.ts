/**
 * HQ Accountant cargo bill actions — visibility, return, postpone, costing, receiving.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { TransportExpenseStatus } from '@prisma/client';
import {
  CARGO_RETURN_BLOCKED_MESSAGE,
  getCargoBillActionVisibility,
  resolveCargoApprovalStatus,
} from './cargo-bill-actions.util';
import {
  evaluateHqReceivingInvoiceSection,
  isTransportExpenseAccountantProcessed,
} from './hq-receiving-validation.util';
import { isExpenseApprovedForLandedCost } from './procurement-cost.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);
const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const billsService = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');
const panel = readFileSync(
  join(__dirname, '../../../web/src/components/ProcurementSectionPayablePanel.tsx'),
  'utf8',
);

// 1. Waiting Cargo Payment shows all four actions
const waiting = getCargoBillActionVisibility({
  uiStatus: 'AWAITING_ACCOUNTANT',
  paidAmount: 0,
  remainingAmount: 100000,
});
assert(waiting.showPayFull, '1. pay full');
assert(waiting.showPartial, '1. partial');
assert(waiting.showPostpone, '1. postpone');
assert(waiting.showReturnForCorrection, '1. return');

// 2-4. Partially paid — pay remainder, partial, postpone; no return
const partial = getCargoBillActionVisibility({
  uiStatus: 'PARTIALLY_PAID',
  paidAmount: 40000,
  remainingAmount: 60000,
});
assert(partial.showPayRemainder, '2. pay remainder');
assert(partial.showPartial, '2. partial');
assert(partial.showPostpone, '2. postpone');
assert(!partial.showReturnForCorrection, '2. no return');
assert(partial.showCannotReturnMessage, '2. blocked message flag');

// 5. Postponed actions
const postponed = getCargoBillActionVisibility({
  uiStatus: 'PAYMENT_POSTPONED',
  paidAmount: 0,
  remainingAmount: 100000,
});
assert(postponed.showPayFull, '5. postponed pay full');
assert(postponed.showChangePostponeDate, '5. change date');
assert(postponed.showReturnForCorrection, '5. return when unpaid');

// 6. Fully paid banner only
const paid = getCargoBillActionVisibility({
  uiStatus: 'FULLY_PAID',
  paidAmount: 100000,
  remainingAmount: 0,
});
assert(paid.showPaidBanner, '6. paid banner');
assert(!paid.showPayFull, '6. no pay actions');

// 7. Returned — awaiting correction banner
const returned = getCargoBillActionVisibility({
  uiStatus: 'RETURNED',
  paidAmount: 0,
  remainingAmount: 100000,
});
assert(returned.showAwaitingCorrectionBanner, '7. awaiting correction');

// 8. Backend full payment audit
assert(service.includes('CARGO_PAYMENT_FULLY_PAID'), '8. full payment audit');

// 9. Backend return blocks paid invoices
assert(service.includes(CARGO_RETURN_BLOCKED_MESSAGE), '9. return blocked message');
assert(service.includes('returnCargoForCorrection'), '9. dedicated return method');

// 10. Postpone creates no ledger
const postponeSection = billsService.slice(
  billsService.indexOf('async postponePayment'),
  billsService.indexOf('async payCargoPayment'),
);
assert(!postponeSection.includes('postLedgerEntry'), '10. postpone no ledger');

// 11. Return creates no payment posting in returnCargoForCorrectionInTx
const returnBlock = service.slice(
  service.indexOf('returnCargoForCorrectionInTx'),
  service.indexOf('payCargoByAccountant'),
);
assert(!returnBlock.includes('postLedgerEntry'), '11. return no ledger');

// 12. Return requires reason at bills layer
assert(billsService.includes('Return reason is required'), '12. return reason required');

// 13-14. Supply Manager correction UI
assert(panel.includes('RETURNED') || panel.includes('returnReason'), '13. SM sees returned state');
assert(panel.includes('returnReason') || panel.includes('Требует исправления'), '14. correction reason');

// 15. Resubmission path exists in transport service
assert(service.includes('CARGO_PAYMENT_RESUBMITTED') || service.includes('WAITING_ACCOUNTANT'), '15. resubmit path');

// 17. Paid cargo cannot simple-return
assert(service.includes('paidAmountKgs > 0.009'), '17. paid blocks return');

// 18. Returned excludes landed cost
assert(!isExpenseApprovedForLandedCost(TransportExpenseStatus.RETURNED), '18. returned excluded from cost');

// 19. Returned blocks warehouse readiness
const cargoReturnedGate = evaluateHqReceivingInvoiceSection(
  [
    {
      procurementOrderId: 'o1',
      expenseType: 'INTERNATIONAL_FREIGHT',
      amount: 50000,
      amountKgs: 50000,
      status: TransportExpenseStatus.RETURNED,
    },
  ],
  'o1',
  'CARGO_PAYMENT',
);
assertEqual(cargoReturnedGate.accountantProcessed, false, '19. returned not processed');

// 20. Processed postponed uses approved amount in landed cost
assert(isExpenseApprovedForLandedCost(TransportExpenseStatus.PAYMENT_POSTPONED), '20. postponed in cost');

// 21. Frontend uses action visibility helper
assert(page.includes('getCargoBillActionVisibility'), '21. frontend visibility helper');
assert(page.includes('confirmPayFull'), '21. confirmation dialogs');

// 22. Idempotency on return
assert(returnBlock.includes('idempotencyKey'), '22. return idempotency');

// Approval status separation
assertEqual(
  resolveCargoApprovalStatus(TransportExpenseStatus.RETURNED),
  'RETURNED_FOR_CORRECTION',
  'approval returned',
);
assertEqual(
  resolveCargoApprovalStatus(TransportExpenseStatus.PAYMENT_POSTPONED),
  'PROCESSED',
  'approval processed when postponed',
);

// Accountant processed for partial/postponed/paid transport
assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.PARTIALLY_PAID), 'partial processed');
assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.PAYMENT_POSTPONED), 'postponed processed');
assert(!isTransportExpenseAccountantProcessed(TransportExpenseStatus.RETURNED), 'returned not processed');

console.log('cargo-bill-actions.util.test.ts passed');
