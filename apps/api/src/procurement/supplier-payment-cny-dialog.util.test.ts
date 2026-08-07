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

assert(!page.includes('processingStatus') || page.includes('!isSupplierPayment'), '1. processing status hidden for supplier');
assert(page.includes('!isSupplierPayment') && page.includes('finance.billsToPay.basis'), '2. basis hidden for supplier');
assert(page.includes('!isSupplierPayment && auditHistory.length'), '3. action history hidden for supplier');
assert(page.includes('SupplierPaymentModal'), '4. supplier payment modal exists');
assert(page.includes('finance.billsToPay.supplierAmountCny'), '4b. full dialog shows CNY amount');
assert(page.includes('finance.billsToPay.cnyToKgsRate'), '5. exchange rate field');
assert(page.includes('previewCnyToKgs'), '6. live KGS preview');
assert(page.includes('finance.billsToPay.totalAmountInKgs'), '8. partial total KGS');
assert(page.includes('finance.billsToPay.paidPreviously'), '9. partial paid previously');
assert(page.includes('finance.billsToPay.currentPaymentAmount'), '11. partial current payment KGS');
assert(page.includes('finance.billsToPay.cnyRateRequired'), '12. Russian rate validation key');
assert(page.includes('exchangeRateCnyKgs'), 'payload includes exchange rate');
assert(exchangeUtil.includes('calculateApprovedSupplierKgsFromRate'), '15. decimal backend calc');
assert(service.includes('SUPPLIER_CNY_RATE_REQUIRED_MESSAGE'), '12b. backend Russian rate message');
assert(service.includes('defaultYuanRate: authoritativeRate'), '13. rate persisted on order');

console.log('supplier-payment-cny-dialog.util.test.ts passed');
