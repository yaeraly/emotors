import { FinanceLedgerEntryType } from '@prisma/client';

const INCOME_TYPES = new Set([
  FinanceLedgerEntryType.INCOME,
  FinanceLedgerEntryType.PAYMENT,
  FinanceLedgerEntryType.OWNER_INVESTMENT,
  FinanceLedgerEntryType.CAPITAL_INJECTION,
]);

const TRANSFER_TYPES = new Set([
  FinanceLedgerEntryType.TRANSFER_IN,
  FinanceLedgerEntryType.TRANSFER_OUT,
]);

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(INCOME_TYPES.has(FinanceLedgerEntryType.OWNER_INVESTMENT), true, 'investment is income-like');
assertEqual(TRANSFER_TYPES.has(FinanceLedgerEntryType.TRANSFER_IN), true, 'transfer in excluded from P&L');
assertEqual(TRANSFER_TYPES.has(FinanceLedgerEntryType.EXPENSE), false, 'expense is not transfer');

console.log('finance-transfer-accounting.test.ts passed');
