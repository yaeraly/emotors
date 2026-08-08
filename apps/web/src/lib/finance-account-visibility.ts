import type { FinanceAccount } from './types';

type AccountLike = Pick<FinanceAccount, 'status'> & { id?: string; deletedAt?: string | null };

/** Matches `/finance/accounts` for HQ/Branch cashiers: assigned, non-deleted, ACTIVE only. */
export function isActiveUsableFinanceAccount(account: AccountLike): boolean {
  if (account.deletedAt) return false;
  return account.status === 'ACTIVE';
}

export function countActiveUsableFinanceAccounts(accounts: AccountLike[]): number {
  const seenIds = new Set<string>();
  let count = 0;
  for (const account of accounts) {
    if (!isActiveUsableFinanceAccount(account)) continue;
    if (account.id) {
      if (seenIds.has(account.id)) continue;
      seenIds.add(account.id);
    }
    count += 1;
  }
  return count;
}

export function canShowHqCashierAccountTransferMenu(accounts: AccountLike[]): boolean {
  return countActiveUsableFinanceAccounts(accounts) >= 2;
}
