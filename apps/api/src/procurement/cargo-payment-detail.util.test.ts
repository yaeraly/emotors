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

assert(
  accountantPage.includes("const isCargoPayment = requestType === 'CARGO_PAYMENT'") &&
    accountantPage.includes('!isCargoPayment') &&
    accountantPage.includes('finance.billsToPay.actionHistory'),
  '1. HQ Accountant cargo payment hides action history section',
);
assert(
  cashierPage.includes("selected.requestType !== 'CARGO_PAYMENT'") &&
    cashierPage.includes('procurement.sectionPayable.expenseName'),
  '2. HQ Cashier cargo payment hides expense name field',
);
assert(
  cashierPage.includes("selected.requestType === 'CARGO_PAYMENT' && selected.cargo"),
  '3. cargo section remains visible for cargo payment',
);

console.log('cargo-payment-detail.util.test.ts passed');
