import type { CashierBillSource } from './cashier-bills.util';

export type CashierBillCloseRawResult = {
  id: string;
  source: CashierBillSource;
  executionStatus: string;
  payment?: Record<string, unknown> | null;
  invoice?: Record<string, unknown> | null;
  receiptAttachment?: { id: string; fileName: string; fileUrl: string } | null;
  receiptAttachments?: Array<{ id: string; fileName: string; fileUrl: string }>;
  creatorNotification?: unknown;
};

export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, current) => {
      if (typeof current === 'bigint') {
        return current.toString();
      }
      if (current instanceof Date) {
        return current.toISOString();
      }
      if (
        current &&
        typeof current === 'object' &&
        typeof (current as { toJSON?: () => unknown }).toJSON === 'function' &&
        (current as { constructor?: { name?: string } }).constructor?.name === 'Decimal'
      ) {
        return Number(current);
      }
      return current;
    }),
  ) as T;
}

export function serializeCashierBillCloseResponse(raw: CashierBillCloseRawResult) {
  const payment = raw.payment ? toJsonSafe(raw.payment) : null;
  const invoice = raw.invoice ? toJsonSafe(raw.invoice) : null;

  let remainingAmount = 0;
  let paymentStatus = '';

  if (raw.source === 'SUPPLIER_PAYMENT' && invoice) {
    const remainingYuan = Number(invoice.remainingYuan ?? 0);
    const rate = Number(invoice.weightedAverageYuanRate ?? payment?.exchangeRate ?? 0);
    remainingAmount =
      Number.isFinite(remainingYuan) && rate > 0
        ? Math.round(remainingYuan * rate * 100) / 100
        : remainingYuan;
    paymentStatus = String(invoice.supplierPaymentStatus ?? payment?.status ?? '');
  } else if (raw.source === 'TRANSPORT_EXPENSE' && invoice) {
    const requested = Number(invoice.amountKgs ?? invoice.amount ?? 0);
    const paid = Number(invoice.paidAmountKgs ?? 0);
    remainingAmount = Math.max(0, Math.round((requested - paid) * 100) / 100);
    paymentStatus = String(invoice.status ?? '');
  }

  const accountBalance =
    payment?.actualFinanceAccount != null &&
    typeof payment.actualFinanceAccount === 'object' &&
    'availableBalance' in payment.actualFinanceAccount
      ? Number((payment.actualFinanceAccount as { availableBalance: unknown }).availableBalance)
      : invoice?.financeAccount != null &&
          typeof invoice.financeAccount === 'object' &&
          'availableBalance' in invoice.financeAccount
        ? Number((invoice.financeAccount as { availableBalance: unknown }).availableBalance)
        : null;

  return {
    id: raw.id,
    source: raw.source,
    executionStatus: raw.executionStatus,
    invoice,
    payment,
    remainingAmount,
    paymentStatus,
    receiptAttachment: raw.receiptAttachment ?? null,
    receiptAttachments: raw.receiptAttachments ?? [],
    creatorNotification: raw.creatorNotification ? toJsonSafe(raw.creatorNotification) : null,
    updatedAccountBalance: accountBalance,
  };
}
