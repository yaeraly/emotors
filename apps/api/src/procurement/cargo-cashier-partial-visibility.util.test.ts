/**
 * HQ Cashier queue must keep partially paid Cargo invoices visible while debt remains.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { TransportExpenseStatus } from '@prisma/client';
import {
  isActiveTransportPayableRow,
  resolveTransportExpenseAmounts,
} from './cashier-bills.util';

function assert(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const service = readFileSync(join(__dirname, './cashier-bills.service.ts'), 'utf8');
const page = readFileSync(
  join(__dirname, '../../../web/src/app/finance/cashier-bills/page.tsx'),
  'utf8',
);
const transport = readFileSync(join(__dirname, './transport-expense.service.ts'), 'utf8');

// 1-3. Active payable includes unpaid, partial, postponed with remaining
assert(
  isActiveTransportPayableRow({
    status: TransportExpenseStatus.PENDING_CASHIER,
    remainingKgs: 150000,
  }),
  '1. unpaid cargo payable',
);
assert(
  isActiveTransportPayableRow({
    status: TransportExpenseStatus.PARTIALLY_PAID,
    remainingKgs: 100000,
  }),
  '2. partially paid cargo payable',
);
assert(
  isActiveTransportPayableRow({
    status: TransportExpenseStatus.PAYMENT_POSTPONED,
    remainingKgs: 100000,
  }),
  '3. postponed cargo payable',
);

// 4-6. Partial payment math
const amounts = resolveTransportExpenseAmounts({
  amountKgs: 150000,
  paidAmountKgs: 50000,
});
assertEqual(amounts.paidKgs, 50000, '4. paid amount');
assertEqual(amounts.remainingKgs, 100000, '5. remaining amount');
assertEqual(amounts.totalKgs, 150000, '6. invoice total');

// 7-8. Backend query includes partial/postponed statuses
assert(service.includes('TransportExpenseStatus.PARTIALLY_PAID'), '7. backend includes PARTIALLY_PAID');
assert(service.includes('TransportExpenseStatus.PAYMENT_POSTPONED'), '8. backend includes PAYMENT_POSTPONED');
assert(service.includes('isActiveTransportPayableRow'), '7. backend filters by remaining balance');

// 9-11. Fully paid leaves active queue; partial stays
assert(
  !isActiveTransportPayableRow({
    status: TransportExpenseStatus.PAID,
    remainingKgs: 0,
    includePaidToday: false,
  }),
  '11. fully paid excluded from active queue',
);
assert(
  isActiveTransportPayableRow({
    status: TransportExpenseStatus.PAID,
    remainingKgs: 0,
    includePaidToday: true,
  }),
  '12. fully paid may appear as paid-today history',
);

// 13. Frontend refreshes list after payment; no optimistic removal
assert(page.includes('refreshAfterAction'), '13. refresh after payment');
assert(page.includes('await load()') || page.includes('await load();'), '13. reloads table');
assert(!page.includes('filter((row)') || !page.includes('.filter((item) => item.id !=='), '13. no optimistic row removal');

// 14-15. Excluded statuses
assert(
  !isActiveTransportPayableRow({
    status: TransportExpenseStatus.CANCELLED,
    remainingKgs: 1000,
  }),
  '15. cancelled excluded',
);
assert(
  !isActiveTransportPayableRow({
    status: TransportExpenseStatus.REJECTED,
    remainingKgs: 1000,
  }),
  '15. rejected excluded',
);

// 16. Status badge shows partially paid
assert(page.includes('PARTIALLY_PAID'), '6. partial status in UI');
assert(page.includes('resolveCashierRowStatus'), '6. row status resolver');

// 17. Audit events for partial / remaining / full
assert(transport.includes('CARGO_PARTIAL_PAYMENT_CREATED'), '17. partial payment audit');
assert(transport.includes('CARGO_PAYMENT_REMAINING_UPDATED'), '17. remaining updated audit');
assert(transport.includes('CARGO_PAYMENT_FULLY_PAID'), '17. fully paid audit');

// 18. Confirm only when accountant instruction is active
assert(page.includes("=== 'PENDING_CASHIER'"), '9. confirm gated on pending cashier');

console.log('cargo-cashier-partial-visibility.util.test.ts passed');
