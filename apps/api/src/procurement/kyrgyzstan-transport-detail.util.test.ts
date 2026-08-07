import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const accountantPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);
const cashierPage = readFileSync(
  join(__dirname, '../../../web/src/app/finance/cashier-bills/page.tsx'),
  'utf8',
);
const accountantService = readFileSync(join(__dirname, './accountant-bills.service.ts'), 'utf8');

assert(
  accountantPage.includes('isKyrgyzstanTransport') &&
    accountantPage.includes('finance.billsToPay.basis'),
  '1. basis hidden for kyrgyzstan transport',
);
assert(
  accountantPage.includes('!isKyrgyzstanTransport') &&
    accountantPage.includes('finance.billsToPay.nextPaymentDate'),
  '2. next payment date hidden for kyrgyzstan transport',
);
assert(
  accountantPage.includes('!isKyrgyzstanTransport') &&
    accountantPage.includes('finance.billsToPay.actionHistory'),
  '3. action history hidden for kyrgyzstan transport',
);
assert(
  cashierPage.includes("selected.requestType !== 'KYRGYZSTAN_DOMESTIC_TRANSPORT'") &&
    cashierPage.includes('procurement.sectionPayable.expenseName'),
  '4. expense name hidden for kyrgyzstan transport',
);
assert(
  cashierPage.includes("selected.requestType !== 'KYRGYZSTAN_DOMESTIC_TRANSPORT'") &&
    cashierPage.includes('finance.cashierBills.exchangeRate'),
  '5. exchange rate hidden for kyrgyzstan transport',
);
assert(
  accountantService.includes('LOCAL_DELIVERY') &&
    accountantService.includes('isKyrgyzstanDomestic'),
  '6. accountant detail skips audit fetch for kyrgyzstan transport',
);

console.log('kyrgyzstan-transport-detail.util.test.ts passed');
