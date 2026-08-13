import { FinanceLedgerEntryType } from '@prisma/client';
import { roundMoney } from './finance-number.util';

export type InvestmentEditPlan =
  | { kind: 'noop' }
  | {
      kind: 'amount_delta';
      delta: number;
      entryType: FinanceLedgerEntryType;
      /** Absolute amount posted to ledger for the delta adjustment */
      postAmount: number;
    }
  | {
      kind: 'account_change';
      reverseAmount: number;
      creditAmount: number;
      creditEntryType: FinanceLedgerEntryType;
    };

/** Pure planner for investment edit finance effects (no duplicate full income). */
export function planInvestmentEditEffect(input: {
  oldAmount: number;
  newAmount: number;
  oldAccountId: string;
  newAccountId: string;
  investmentType: string;
}): InvestmentEditPlan {
  const oldAmount = roundMoney(input.oldAmount);
  const newAmount = roundMoney(input.newAmount);
  const accountChanged = input.oldAccountId !== input.newAccountId;
  const amountChanged = Math.abs(newAmount - oldAmount) > 0.009;
  const creditEntryType =
    input.investmentType === 'INVESTOR_INVESTMENT'
      ? FinanceLedgerEntryType.CAPITAL_INJECTION
      : FinanceLedgerEntryType.OWNER_INVESTMENT;

  if (accountChanged) {
    return {
      kind: 'account_change',
      reverseAmount: oldAmount,
      creditAmount: newAmount,
      creditEntryType,
    };
  }

  if (!amountChanged) {
    return { kind: 'noop' };
  }

  const delta = roundMoney(newAmount - oldAmount);
  return {
    kind: 'amount_delta',
    delta,
    entryType: delta > 0 ? creditEntryType : FinanceLedgerEntryType.EXPENSE,
    postAmount: Math.abs(delta),
  };
}

/** Active investments only — deleted rows excluded from totals. */
export function sumActiveInvestmentAmounts(
  rows: Array<{ amount: number | string; deletedAt?: Date | string | null }>,
): number {
  return roundMoney(
    rows
      .filter((row) => !row.deletedAt)
      .reduce((sum, row) => sum + Number(row.amount), 0),
  );
}

/** Create/update payload must never accept the removed provider field. */
export function assertNoProviderField(body: Record<string, unknown>) {
  const forbidden = [
    'providedBy',
    'investorName',
    'investmentProvider',
    'sourcePerson',
    'providerName',
    'contributedBy',
  ];
  return !forbidden.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}
