/**
 * Cargo payment routing: HQ Accountant approves → HQ Cashier executes.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveSupplierPaymentMethodFromAccountType,
} from './supplier-payment-method-from-account.util';
import { sumConfirmedExpenseAmountKgs } from './procurement-cost.util';
import { getCargoBillActionVisibility } from './cargo-bill-actions.util';

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
const dto = readFileSync(join(__dirname, './dto/transport-expense.dto.ts'), 'utf8');
const controller = readFileSync(join(__dirname, './procurement.controller.ts'), 'utf8');
const cashierService = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

const payBlock = service.slice(
  service.indexOf('payCargoByAccountant'),
  service.indexOf('confirmPayment(user: AuthUser'),
);
const confirmBlock = service.slice(
  service.indexOf('confirmPayment(user: AuthUser'),
  service.indexOf('async uploadQr'),
);

// 1. Accountant routes to cashier — no direct payment
assert(payBlock.includes('CARGO_PAYMENT_SENT_TO_HQ_CASHIER'), '1. cashier instruction audit');
assert(payBlock.includes('TransportExpenseStatus.PENDING_CASHIER'), '1. routes to cashier queue');
assert(!payBlock.includes('postLedgerEntry'), '2. accountant does not post ledger');
assert(!payBlock.includes('paidAmountKgs: newPaidTotal'), '2. accountant does not update paid amount');

// 3. Partial instruction without financial posting
assert(payBlock.includes('CARGO_PARTIAL_PAYMENT_INSTRUCTION_CREATED'), '4. partial instruction audit');
assert(payBlock.includes('cashierInstructionAmountKgs'), '4. stores planned payment amount');

// 5-6. Postpone / return have no ledger in accountant path
const postponeBlock = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');
const postponeSection = postponeBlock.slice(
  postponeBlock.indexOf('async postponePayment'),
  postponeBlock.indexOf('async payCargoPayment'),
);
assert(!postponeSection.includes('postLedgerEntry'), '6. postpone has no ledger');

// 7-8. Cashier queue uses instruction amount
assert(cashierService.includes('cashierInstructionAmountKgs'), '8. cashier sees instruction amount');
assert(cashierService.includes('approvedAmountKgs'), '9. cashier detail exposes approved amount');

// 9-12. Cashier executes real payment
assert(confirmBlock.includes('postLedgerEntry'), '11. cashier posts ledger');
assert(confirmBlock.includes('CARGO_PAYMENT_EXECUTED_BY_HQ_CASHIER'), '11. cashier execution audit');
assert(confirmBlock.includes('cashierInstructionAmountKgs: null'), '12. clears instruction after pay');

// 13-14. Partial leaves invoice open
assert(confirmBlock.includes('TransportExpenseStatus.PARTIALLY_PAID'), '13. partial status after cashier');
assert(confirmBlock.includes('CARGO_PAYMENT_FULLY_PAID'), '14. full close audit');

// 15. Receipt required at cashier only
assert(!payBlock.includes('TRANSPORT_EXPENSE_RECEIPT'), '15. accountant does not require receipt');
assert(confirmBlock.includes('TRANSPORT_EXPENSE_RECEIPT'), '15. cashier requires receipt');

// 16. Duplicate instruction blocked
assert(payBlock.includes('Счет уже отправлен HQ Cashier.'), '17. duplicate instruction error');

// 18-19. Costing uses approved amount
const approvedCost = sumConfirmedExpenseAmountKgs(
  [
    {
      amount: 150000,
      currency: 'KGS',
      amountKgs: 150000,
      paidAmountKgs: 70000,
      status: 'PARTIALLY_PAID',
    },
  ],
  12,
);
assertEqual(approvedCost, 150000, '19. costing uses approved full amount');

// 20. APPROVED status hides accountant pay buttons while at cashier
const approvedActions = getCargoBillActionVisibility({
  uiStatus: 'APPROVED',
  paidAmount: 0,
  remainingAmount: 1000,
});
assert(!approvedActions.showPayFull, '20. no pay while waiting for cashier');
assert(!approvedActions.showPartial, '20. no partial while waiting for cashier');

// Frontend routes to pay endpoint but sends instruction (not execution)
assert(controller.includes('bills-to-pay/:source/:id/pay'), 'pay endpoint exists');
assert(page.includes('/pay'), 'frontend calls pay endpoint');
assert(page.includes("t('finance.billsToPay.sendToCashier')"), 'frontend sends to cashier label');
assert(!page.includes('uploadCargoReceipt(cargoPaymentModal'), 'accountant form does not upload receipt');

// Schema field
assert(schema.includes('cashierInstructionAmountKgs'), 'schema stores instruction amount');

// Payment method derived from account
assertEqual(resolveSupplierPaymentMethodFromAccountType('CASHBOX'), 'CASH', 'cashbox → cash');

console.log('cargo-partial-payment.util.test.ts passed');
