import type { FinanceAccount } from './types';

type AccountLike = Pick<FinanceAccount, 'status'> & { deletedAt?: string | null };

/** Matches `/finance/accounts` for HQ/Branch cashiers: assigned, non-deleted, ACTIVE only. */
export function isActiveUsableFinanceAccount(account: AccountLike): boolean {
  if (account.deletedAt) return false;
  return account.status === 'ACTIVE';
}

export function countActiveUsableFinanceAccounts(accounts: AccountLike[]): number {
  return accounts.filter(isActiveUsableFinanceAccount).length;
}

export function canShowHqCashierAccountTransferMenu(accounts: AccountLike[]): boolean {
  return countActiveUsableFinanceAccounts(accounts) >= 2;
}
