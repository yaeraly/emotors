import { FinanceLedgerEntryType } from '@prisma/client';
import {
  assertNoProviderField,
  planInvestmentEditEffect,
  sumActiveInvestmentAmounts,
} from './finance-investments.util';
import { CreateFinanceInvestmentDto, UpdateFinanceInvestmentDto } from './dto/create-finance-investment.dto';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// 8. Increasing amount updates only the balance difference
{
  const plan = planInvestmentEditEffect({
    oldAmount: 100_000,
    newAmount: 120_000,
    oldAccountId: 'cash',
    newAccountId: 'cash',
    investmentType: 'OWNER_INVESTMENT',
  });
  assertDeepEqual(
    plan,
    {
      kind: 'amount_delta',
      delta: 20_000,
      entryType: FinanceLedgerEntryType.OWNER_INVESTMENT,
      postAmount: 20_000,
    },
    'increase posts only delta',
  );
}

// 9. Decreasing amount updates only the balance difference
{
  const plan = planInvestmentEditEffect({
    oldAmount: 100_000,
    newAmount: 80_000,
    oldAccountId: 'cash',
    newAccountId: 'cash',
    investmentType: 'OWNER_INVESTMENT',
  });
  assertDeepEqual(
    plan,
    {
      kind: 'amount_delta',
      delta: -20_000,
      entryType: FinanceLedgerEntryType.EXPENSE,
      postAmount: 20_000,
    },
    'decrease posts only absolute delta as expense',
  );
}

// 10. Changing Finance Account reverses old and credits new
{
  const plan = planInvestmentEditEffect({
    oldAmount: 100_000,
    newAmount: 120_000,
    oldAccountId: 'cash',
    newAccountId: 'bank',
    investmentType: 'INVESTOR_INVESTMENT',
  });
  assertDeepEqual(
    plan,
    {
      kind: 'account_change',
      reverseAmount: 100_000,
      creditAmount: 120_000,
      creditEntryType: FinanceLedgerEntryType.CAPITAL_INJECTION,
    },
    'account change reverses old and credits new once',
  );
}

// 11. Editing without amount/account change does not create duplicate income
{
  const plan = planInvestmentEditEffect({
    oldAmount: 50_000,
    newAmount: 50_000,
    oldAccountId: 'cash',
    newAccountId: 'cash',
    investmentType: 'OWNER_INVESTMENT',
  });
  assertEqual(plan.kind, 'noop', 'no finance effect when unchanged');
}

// 13. Deleted investment excluded from active totals
{
  const total = sumActiveInvestmentAmounts([
    { amount: 100_000, deletedAt: null },
    { amount: 50_000, deletedAt: new Date().toISOString() },
    { amount: '25000', deletedAt: null },
  ]);
  assertEqual(total, 125_000, 'deleted rows excluded from active totals');
}

// 5–7. Provider field removed from create/update payloads
{
  const createSample: CreateFinanceInvestmentDto = {
    accountId: 'a1',
    amount: 100,
    currency: 'KGS',
    investmentDate: '2026-07-21',
    investmentType: 'OWNER_INVESTMENT',
    investorOwnerName: 'Owner',
  };
  const updateSample: UpdateFinanceInvestmentDto = {
    amount: 120,
    currency: 'KGS',
  };
  assertEqual(
    Object.prototype.hasOwnProperty.call(createSample, 'providedBy'),
    false,
    'create payload has no providedBy',
  );
  assertEqual(
    Object.prototype.hasOwnProperty.call(updateSample, 'providedBy'),
    false,
    'update payload has no providedBy',
  );
  assertEqual(assertNoProviderField({ amount: 1, currency: 'KGS' }), true, 'clean payload ok');
  assertEqual(
    assertNoProviderField({ providedBy: 'Someone' }),
    false,
    'providedBy rejected',
  );
}

console.log('finance-investments.util.test.ts passed');
