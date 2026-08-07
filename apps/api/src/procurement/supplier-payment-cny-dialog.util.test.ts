import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);
const exchangeUtil = readFileSync(
  join(__dirname, './supplier-payment-exchange-rate.util.ts'),
  'utf8',
);
const service = readFileSync(join(__dirname, './supplier-payment-workflow.service.ts'), 'utf8');
const accountantBills = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');

assert(!page.includes('processingStatus') || page.includes('!isSupplierPayment'), '1. processing status hidden for supplier');
assert(page.includes('!isSupplierPayment') && page.includes('finance.billsToPay.basis'), '2. basis hidden for supplier');
assert(
  page.includes('!isSupplierPayment') &&
    page.includes('auditHistory.length') &&
    page.includes('!isCargoPayment'),
  '3. action history hidden for supplier',
);
assert(page.includes('SupplierPaymentModal'), '4. supplier payment modal exists');
assert(page.includes('finance.billsToPay.supplierAmountCny'), '4b. full dialog shows CNY amount');
assert(page.includes('finance.billsToPay.cnyToKgsRate'), '5. exchange rate field');
assert(page.includes('previewCnyToKgs'), '6. live KGS preview');
assert(page.includes('finance.billsToPay.totalAmountInKgs'), '8. partial total KGS');
assert(page.includes('finance.billsToPay.paidPreviously'), '9. partial paid previously');
assert(page.includes('finance.billsToPay.currentPaymentAmount'), '11. partial current payment KGS');
assert(page.includes('finance.billsToPay.cnyRateRequired'), '12. Russian rate validation key');
assert(page.includes('exchangeRateCnyKgs'), 'payload includes exchange rate');
assert(accountantBills.includes('exchangeRateEditable'), '7. editable rate flag from detail');
assert(!page.includes('disabled={form.exchangeRateLocked}'), '7b. rate input not hard-disabled');
assert(exchangeUtil.includes('isSupplierPaymentExchangeRateRevisionAllowed'), 'revision detection util');
assert(exchangeUtil.includes('SUPPLIER_EXCHANGE_RATE_REVISED'), '12. rate revision audit action');
assert(service.includes('SUPPLIER_EXCHANGE_RATE_REVISED'), '12b. workflow writes rate revision audit');
assert(service.includes('allowRateRevision'), 'backend accepts revised rate after correction');
assert(exchangeUtil.includes('calculateApprovedSupplierKgsFromRate'), '15. decimal backend calc');
assert(service.includes('SUPPLIER_CNY_RATE_REQUIRED_MESSAGE'), '12c. backend Russian rate message');
assert(accountantBills.includes('lastPaidExchangeRateCnyKgs'), 'last paid rate exposed in detail');
assert(accountantBills.includes('defaultExchangeRateCnyKgs'), 'default dialog rate exposed in detail');
assert(accountantBills.includes('displayExchangeRateCnyKgs'), 'read-only detail display rate exposed');
assert(accountantBills.includes('resolveSupplierPaymentDetailDisplayExchangeRate'), 'detail display rate resolver');
assert(page.includes('displayExchangeRateCnyKgs'), 'detail page shows display exchange rate');
assert(page.includes('formatSupplierDetailExchangeRate'), 'detail page rate formatter');
assert(page.includes('defaultExchangeRateCnyKgs'), 'frontend prefills dialog rate on open');
assert(exchangeUtil.includes('resolveLatestConfirmedSupplierPaymentExchangeRate'), 'latest paid rate resolver');
assert(service.includes('resolveSupplierPayRemainderInstruction'), 'pay remainder uses remaining cny × rate');
assert(service.includes('assertSupplierPartialPaymentWithinRemainingCny'), 'partial validates cny against cny');
assert(page.includes('payRemainder'), 'frontend sends pay remainder flag');
assert(page.includes('remainingCny'), 'pay remainder dialog shows remaining cny');
assert(page.includes('finance.billsToPay.payRemainder'), 'pay remainder dialog title');

console.log('supplier-payment-cny-dialog.util.test.ts passed');
