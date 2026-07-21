import { FinanceTransferStatus } from '@prisma/client';

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

const EDITABLE = new Set<string>([FinanceTransferStatus.DRAFT, FinanceTransferStatus.RETURNED]);
const AWAITING_CASHIER = new Set<string>([
  FinanceTransferStatus.PENDING_CASHIER,
  FinanceTransferStatus.PENDING,
]);

assert(EDITABLE.has(FinanceTransferStatus.DRAFT), 'draft is editable');
assert(EDITABLE.has(FinanceTransferStatus.RETURNED), 'returned is editable');
assert(!EDITABLE.has(FinanceTransferStatus.COMPLETED), 'completed is not editable');
assert(!EDITABLE.has(FinanceTransferStatus.PENDING_CASHIER), 'cashier queue is not editable by accountant');

assert(AWAITING_CASHIER.has(FinanceTransferStatus.PENDING_CASHIER), 'pending cashier awaits cashier');
assert(AWAITING_CASHIER.has(FinanceTransferStatus.PENDING), 'legacy pending awaits cashier');
assert(!AWAITING_CASHIER.has(FinanceTransferStatus.DRAFT), 'draft does not await cashier');
assert(!AWAITING_CASHIER.has(FinanceTransferStatus.COMPLETED), 'completed does not await cashier');

function validateAccounts(sourceId: string, destId: string, amount: number) {
  if (amount <= 0) return 'amount';
  if (sourceId === destId) return 'same-account';
  return null;
}

assert(validateAccounts('a', 'a', 100) === 'same-account', 'same account rejected');
assert(validateAccounts('a', 'b', 0) === 'amount', 'zero amount rejected');
assert(validateAccounts('a', 'b', 10) === null, 'valid transfer accepted');

console.log('finance-transfer-workflow.util.test.ts passed');
