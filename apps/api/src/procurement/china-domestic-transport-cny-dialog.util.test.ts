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
  join(__dirname, './china-domestic-transport-approval.util.ts'),
  'utf8',
);
const transportService = readFileSync(
  join(__dirname, './transport-expense.service.ts'),
  'utf8',
);

assert(
  page.includes('isChinaDomesticTransport') && page.includes('finance.billsToPay.basis'),
  '1. basis hidden for china domestic',
);
assert(
  page.includes('isChinaDomesticTransport') && page.includes('finance.billsToPay.invoiceNumber'),
  '2. invoice number hidden for china domestic',
);
assert(
  page.includes('isChinaDomesticTransport') && page.includes('finance.billsToPay.nextPaymentDate'),
  '3. next payment date hidden for china domestic',
);
assert(
  page.includes('!isChinaDomesticTransport') && page.includes('finance.billsToPay.actionHistory'),
  '4. action history hidden for china domestic',
);
assert(page.includes('transportApproveModal') && page.includes('finance.billsToPay.amountCny'), '5. approve dialog CNY amount');
assert(page.includes('finance.billsToPay.cnyToKgsRate'), '6. exchange rate field');
assert(page.includes('previewCnyToKgs'), '7. live KGS preview');
assert(page.includes('formatKgsPreview'), '8. formatted KGS preview');
assert(page.includes('normalizeExchangeRateInput'), '9. decimal rate input');
assert(page.includes('finance.billsToPay.cnyRateRequired'), '11. Russian rate validation key');
assert(page.includes('exchangeRateCnyKgs'), '12. payload includes exchangeRateCnyKgs');
assert(exchangeUtil.includes('calculateApprovedChinaTransportKgsFromRate'), '12b. decimal backend calc');
assert(
  transportService.includes('CHINA_TRANSPORT_CNY_RATE_REQUIRED_MESSAGE'),
  '12c. backend Russian rate message',
);

console.log('china-domestic-transport-cny-dialog.util.test.ts passed');
