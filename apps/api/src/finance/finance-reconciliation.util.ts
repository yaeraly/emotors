import { FinanceAccountStatus } from '@prisma/client';
import { roundMoney } from './finance-number.util';

export function parseReconciliationActualBalance(raw: unknown): number | null {
  if (raw === '' || raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundMoney(parsed);
}

export function resolveReconciliationSystemBalance(account: {
  availableBalance?: unknown;
  currentBalance?: unknown;
}): number {
  return roundMoney(Number(account.availableBalance ?? account.currentBalance ?? 0));
}

export function calculateReconciliationDifference(actualBalance: number, systemBalance: number): number {
  return roundMoney(actualBalance - systemBalance);
}

export function assertReconciliationAccountActive(status: string) {
  if (status !== FinanceAccountStatus.ACTIVE) {
    throw new Error('INACTIVE_ACCOUNT');
  }
}
