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
  page.includes('!isCargoPayment && !isKyrgyzstanTransport') &&
    page.includes('finance.billsToPay.comment'),
  '1. comment hidden for cargo and kyrgyzstan transport detail',
);
assert(
  page.includes('finance.billsToPay.commentOptional'),
  '2. optional comment fields remain in action dialogs',
);
assert(
  page.includes('cargoReturnForm.comment'),
  '3. return dialog optional comment preserved',
);

console.log('accountant-transport-comment-detail.util.test.ts passed');
