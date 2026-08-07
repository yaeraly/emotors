import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);

assert(
  page.includes('!isChinaDomesticTransport') &&
    page.includes("label={t('finance.billsToPay.comment')}") &&
    page.includes('detail.comment || detail.expenseName'),
  'comment field hidden for china domestic transport detail',
);

console.log('accountant-china-transport-comment.util.test.ts passed');
