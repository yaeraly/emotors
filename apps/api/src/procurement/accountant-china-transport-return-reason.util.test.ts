import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/bills-to-pay/page.tsx'),
  'utf8',
);

const returnReasonFieldCount = (
  page.match(/label=\{t\('finance\.billsToPay\.returnReason'\)\}/g) ?? []
).length;

assert(returnReasonFieldCount === 1, 'return reason detail field appears once in drawer');

console.log('accountant-china-transport-return-reason.util.test.ts passed');
