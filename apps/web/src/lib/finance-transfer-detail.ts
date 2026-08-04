import type { FinanceTransfer } from './types';

export type TransferStatusHistoryItem = {
  at: string;
  status: string;
  labelKey: string;
  detail?: string | null;
};

function pushHistory(
  items: TransferStatusHistoryItem[],
  at: string | null | undefined,
  status: string,
  labelKey: string,
  detail?: string | null,
) {
  if (!at) return;
  items.push({ at, status, labelKey, detail });
}

export function buildTransferStatusHistory(transfer: FinanceTransfer): TransferStatusHistoryItem[] {
  const items: TransferStatusHistoryItem[] = [];

  pushHistory(items, transfer.createdAt, transfer.status, 'finance.transferStatusHistory.created');
  pushHistory(items, transfer.sentToCashierAt, 'PENDING_CASHIER', 'finance.transferStatusHistory.sentToCashier');
  pushHistory(items, transfer.returnedAt, 'RETURNED', 'finance.transferStatusHistory.returned', transfer.returnReason);
  pushHistory(items, transfer.approvedAt, 'APPROVED', 'finance.transferStatusHistory.approved');
  pushHistory(items, transfer.completedAt, 'COMPLETED', 'finance.transferStatusHistory.completed');

  if (transfer.status === 'REJECTED' && transfer.returnReason) {
    pushHistory(items, transfer.returnedAt ?? transfer.updatedAt, 'REJECTED', 'finance.transferStatusHistory.rejected', transfer.returnReason);
  }

  if (transfer.status === 'CANCELLED') {
    pushHistory(items, transfer.updatedAt, 'CANCELLED', 'finance.transferStatusHistory.cancelled');
  }

  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function formatTransferField(value: string | null | undefined, emptyLabel = '—') {
  const trimmed = value?.trim();
  return trimmed ? trimmed : emptyLabel;
}
