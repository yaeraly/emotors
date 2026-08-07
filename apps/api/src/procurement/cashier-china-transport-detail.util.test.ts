import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/cashier-bills/page.tsx'),
  'utf8',
);

assert(
  page.includes("selected.requestType !== 'CHINA_DOMESTIC_TRANSPORT'") &&
    page.includes("selected.requestType !== 'SUPPLIER_PAYMENT'") &&
    page.includes('procurement.sectionPayable.expenseName'),
  '1. expense name hidden for china domestic transport and supplier payment',
);
assert(
  page.includes("selected.requestType !== 'CHINA_DOMESTIC_TRANSPORT'") &&
    page.includes('finance.cashierBills.accountHolder'),
  '2. account holder hidden for china domestic transport',
);
assert(
  page.includes("selected.requestType === 'CARGO_PAYMENT' && selected.cargo"),
  '3. cargo section only for cargo payment',
);
assert(!page.includes('{selected.cargo ? ('), '4. cargo section no longer keyed only on cargo payload');

console.log('cashier-china-transport-detail.util.test.ts passed');
