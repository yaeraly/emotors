/**
 * Cargo Payment ↔ Supplier Payment HQ processing parity (static analysis).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { TransportExpenseStatus } from '@prisma/client';
import { canCreateSupplierPayment, canConfirmSupplierPayment } from '../rbac/rbac';
import { getCargoBillActionVisibility } from './cargo-bill-actions.util';
import {
  isExpenseApprovedForLandedCost,
  sumConfirmedExpenseAmountKgs,
} from './procurement-cost.util';
import {
  evaluateHqReceivingInvoiceSection,
  isTransportExpenseAccountantProcessed,
} from './hq-receiving-validation.util';

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
const cashierPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/cashier-bills/page.tsx'),
  'utf8',
);
const service = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');
const supplierService = readFileSync(join(__dirname, './supplier-payment-workflow.service.ts'), 'utf8');
const billsService = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');
const cashierService = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const authSource = readFileSync(join(__dirname, '../rbac/rbac.ts'), 'utf8');

const payBlock = service.slice(
  service.indexOf('payCargoByAccountant'),
  service.indexOf('confirmPayment(user: AuthUser'),
);
const confirmBlock = service.slice(
  service.indexOf('confirmPayment(user: AuthUser'),
  service.indexOf('async uploadQr'),
);

// 1. Accountant actions parity — four cargo actions exposed
const waiting = getCargoBillActionVisibility({
  uiStatus: 'AWAITING_ACCOUNTANT',
  paidAmount: 0,
  remainingAmount: 100000,
});
assert(waiting.showPayFull && waiting.showPartial && waiting.showPostpone && waiting.showReturnForCorrection, '1. four accountant actions');

// 2-4. Full payment instruction — no real payment, no balance change
assert(payBlock.includes('TransportExpenseStatus.PENDING_CASHIER'), '2. full creates cashier instruction');
assert(payBlock.includes('cashierInstructionAmountKgs'), '2. stores planned amount');
assert(!payBlock.includes('postLedgerEntry'), '3. no real payment at accountant');
assert(!payBlock.includes('paidAmountKgs: newPaidTotal'), '4. paid amount unchanged at accountant');

// 5-6. Partial instruction — no paid/remaining mutation before cashier
assert(payBlock.includes('CARGO_PARTIAL_PAYMENT_INSTRUCTION_CREATED'), '5. partial instruction audit');
assert(!payBlock.includes('paidAmountKgs: instructionAmount'), '6. partial does not set paid amount');

// 7-8. Postpone and return — no ledger
const postponeSection = billsService.slice(
  billsService.indexOf('async postponePayment'),
  billsService.indexOf('async permanentlyDelete'),
);
assert(!postponeSection.includes('postLedgerEntry'), '7. postpone no ledger');
const returnBlock = service.slice(
  service.indexOf('returnCargoForCorrectionInTx'),
  service.indexOf('payCargoByAccountant'),
);
assert(!returnBlock.includes('postLedgerEntry'), '8. return no ledger');

// 9-11. UX — no transaction number, optional comment, no second confirm
assert(!page.includes('cargoPaymentForm.transactionNumber'), '9. no txn field');
assert((page.match(/finance\.billsToPay\.commentOptional/g) ?? []).length >= 3, '10. optional comments');
assert(!page.includes('cargoConfirm'), '11. no second confirmation');

// 12. Permissions — same RBAC helpers
assert(authSource.includes('canProcessHqCargoPayment'), '12. cargo uses shared accountant permission');
assert(authSource.includes('canCreateSupplierPayment'), '12. shared create permission');
assert(payBlock.includes('canProcessHqCargoPayment'), '12. accountant guard on pay');
assert(confirmBlock.includes('canConfirmSupplierPayment'), '12. cashier guard on confirm');

// 13-14. Shared cashier queue and components
assert(cashierService.includes('TRANSPORT_EXPENSE'), '13. cargo in cashier service');
assert(cashierService.includes('SUPPLIER_PAYMENT'), '13. supplier in cashier service');
assert(cashierPage.includes('CARGO_PAYMENT') || cashierPage.includes('type.CARGO'), '14. cargo type label');
assert(!cashierPage.includes('cargo-cashier'), '14. no separate cargo cashier page');

// 15-18. Cashier execution updates account, paid, remaining, receipt
assert(confirmBlock.includes('postLedgerEntry'), '15. cashier posts payment');
assert(confirmBlock.includes('paidAmountKgs: newPaidTotal'), '17. updates paid amount');
assert(confirmBlock.includes('deliverReceiptsToCreatorInTx'), '18. receipt to creator');
assert(cashierService.includes('actualPaidKgs'), '15. supplier uses actualPaidKgs');
assert(cashierService.includes('dto.actualPaidKgs'), '15. cargo accepts actualPaidKgs alias');

// 19-21. Partial cycles and idempotency
assert(payBlock.includes('idempotencyKey'), '20. accountant idempotency');
assert(payBlock.includes('Счет уже отправлен HQ Cashier.'), '20. duplicate instruction blocked');
assert(confirmBlock.includes('Cashier cannot change the accountant-approved payment amount'), '21. cashier amount lock');

// 22-23. Costing uses approved amount; cashier pay does not double-allocate
const approvedCost = sumConfirmedExpenseAmountKgs(
  [{ amount: 150000, currency: 'KGS', amountKgs: 150000, paidAmountKgs: 50000, status: 'PARTIALLY_PAID' }],
  12,
);
assertEqual(approvedCost, 150000, '22. costing from approved amount');
assert(confirmBlock.includes('costBaseKgs'), '23. cost base unchanged on partial pay');
assert(isExpenseApprovedForLandedCost(TransportExpenseStatus.PENDING_CASHIER), '23. pending cashier counts for cost');

// 24-25. Warehouse readiness
const returnedGate = evaluateHqReceivingInvoiceSection(
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
assertEqual(returnedGate.accountantProcessed, false, '24. returned blocks readiness');
assert(isTransportExpenseAccountantProcessed(TransportExpenseStatus.PAYMENT_POSTPONED), '25. postponed ready');

// 26. Supplier workflow untouched — no cargo hooks in supplier send path
const supplierSend = supplierService.slice(
  supplierService.indexOf('sendPaymentToCashier'),
  supplierService.indexOf('confirmPayment(user: AuthUser'),
);
assert(!supplierSend.includes('payCargoByAccountant'), '26. supplier unchanged');

// 27. HQ/Branch isolation — cargo auth does not grant branch roles
assert(!authSource.includes('BRANCH_MANAGER: canProcessHqCargoPayment'), '27. no branch role in cargo auth');
assert(billsService.includes('assertAccountant'), '27. accountant assertion on bills');

// 28-29. Build/type-check hooks referenced in package scripts
const apiPkg = readFileSync(join(__dirname, '../../package.json'), 'utf8');
const webPkg = readFileSync(join(__dirname, '../../../web/package.json'), 'utf8');
assert(apiPkg.includes('"build"'), '29. api build script');
assert(webPkg.includes('"build"'), '28. web build script');

// Shared pages — accountant and cashier use same routes
assert(page.includes('/procurement/bills-to-pay'), 'shared bills-to-pay page');
assert(cashierPage.includes('/procurement/cashier-bills'), 'shared cashier-bills page');
assert(page.includes("t('finance.billsToPay.sendToCashier')"), 'cargo routes to cashier label');
assert(!page.includes('uploadCargoReceipt'), 'accountant does not upload receipt');

// Status parity
assert(payBlock.includes('TransportExpenseStatus.PENDING_CASHIER'), 'WAITING_FOR_CASHIER equivalent');
assert(postponeSection.includes('TransportExpenseStatus.PAYMENT_POSTPONED'), 'POSTPONED status');
assert(returnBlock.includes('RETURNED'), 'RETURNED_FOR_CORRECTION path');

// Permission function exports
assert(typeof canCreateSupplierPayment === 'function', 'accountant permission export');
assert(typeof canConfirmSupplierPayment === 'function', 'cashier permission export');

console.log('cargo-supplier-payment-parity.util.test.ts passed');
