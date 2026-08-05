/**
 * Cargo partial payment from HQ Accountant bills-to-pay — contract tests.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveSupplierPaymentMethodFromAccountType,
  tryResolveSupplierPaymentMethodFromAccountType,
} from './supplier-payment-method-from-account.util';
import { sumConfirmedExpenseAmountKgs } from './procurement-cost.util';

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

// 1. Cargo shows partial payment action
assert(page.includes("requestType === 'CARGO_PAYMENT'"), '1. cargo partial gated by request type');
assert(page.includes('openCargoPaymentModal'), '1. cargo payment modal exists');
assert(page.includes("t('finance.billsToPay.createPartialPayment')"), '1. partial payment label');

// 2-4. Validation contracts
assert(dto.includes('paymentAmountKgs!: number'), '2. payment amount in DTO');
assert(service.includes('Сумма платежа должна быть больше нуля.'), '3. zero rejected');
assert(service.includes('Сумма платежа превышает остаток по счету.'), '4. overpayment rejected');

// 5-6. Full vs partial status
assert(service.includes('CARGO_PAYMENT_COMPLETED'), '5. full settlement audit');
assert(service.includes('CARGO_PARTIAL_PAYMENT_CREATED'), '6. partial status audit');
assert(service.includes('TransportExpenseStatus.PARTIALLY_PAID'), '6. partially paid status');

// 7-8. Paid / remaining tracking
assert(service.includes('paidAmountKgs: newPaidTotal'), '7. paid amount updates');
assert(service.includes('newRemainingAmount: roundMoney'), '8. remaining recalculated');

// 9. Ledger decreases account balance
assert(service.includes('postLedgerEntry'), '9. ledger entry created');

// 10. Payment method derived from account type
assertEqual(resolveSupplierPaymentMethodFromAccountType('CASHBOX'), 'CASH', '10. cashbox → cash');
assertEqual(resolveSupplierPaymentMethodFromAccountType('QR_ACCOUNT'), 'QR_CODE', '10. qr account');
assertEqual(resolveSupplierPaymentMethodFromAccountType('BANK'), 'BANK_ACCOUNT', '10. bank');

// 11. Payment history from ledger rows
assert(service.includes('listPaymentLedgerHistory'), '11. payment history helper');
assert(page.includes('detail.payments'), '11. payment history in drawer');

// 12. Idempotency key support
assert(dto.includes('idempotencyKey?: string'), '12. idempotency on pay DTO');
assert(service.includes("action: { in: ['CARGO_PARTIAL_PAYMENT_CREATED', 'CARGO_PAYMENT_COMPLETED'] }"), '12. idempotency check');

// 13. Approved cargo amount unchanged in audit payload
assert(service.includes('approvedCargoAmountKgs: requestedKgs'), '13. approved amount preserved in audit');
assert(service.includes('costBaseKgs'), '13. cost base in audit');

// 14. Landed cost uses approved amount not paid cash
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
assertEqual(approvedCost, 150000, '14. себестоимость uses approved full amount');

// 15. FIFO unchanged — pay method does not touch inventory
const payBlock = service.slice(
  service.indexOf('payCargoByAccountant'),
  service.indexOf('confirmPayment(user: AuthUser'),
);
assert(!payBlock.includes('fifo'), '15. no FIFO mutation');
assert(!payBlock.includes('ProcurementGoodsReceiving'), '15. no warehouse receiving');

// 16. Postpone creates no ledger
const postponeBlock = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');
const postponeSection = postponeBlock.slice(
  postponeBlock.indexOf('async postponePayment'),
  postponeBlock.indexOf('async payCargoPayment'),
);
assert(!postponeSection.includes('postLedgerEntry'), '16. postpone has no ledger');
assert(postponeBlock.includes('CARGO_PAYMENT_POSTPONED'), '16. cargo postpone audit');

// Pay endpoint wired
assert(controller.includes("bills-to-pay/:source/:id/pay"), 'pay endpoint exists');
assert(page.includes('/pay'), 'frontend calls pay endpoint');

// Frontend omits editable payment method field in cargo modal
assert(!page.includes('cargoPaymentForm.paymentMethod'), 'no editable payment method in cargo form');
assert(page.includes('derivedCargoPaymentMethod'), 'derived method shown read-only');

console.log('cargo-partial-payment.util.test.ts passed');
