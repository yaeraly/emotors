/**
 * Unified HQ Cashier "Счета к оплате" view-model helpers.
 * Aggregates accountant-prepared payment tasks (not raw employee requests).
 */

export const CASHIER_BILL_REQUEST_TYPES = [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
  'OTHER_PROCUREMENT_EXPENSE',
] as const;

export type CashierBillRequestType = (typeof CASHIER_BILL_REQUEST_TYPES)[number];

export const CASHIER_EXECUTION_STATUSES = [
  'PENDING_EXECUTION',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'RETURNED_TO_ACCOUNTANT',
  'CANCELLED',
] as const;

export type CashierExecutionStatus = (typeof CASHIER_EXECUTION_STATUSES)[number];

export type CashierBillSource = 'SUPPLIER_PAYMENT' | 'TRANSPORT_EXPENSE';

export type CashierBillListItem = {
  id: string;
  source: CashierBillSource;
  paymentNumber: string;
  requestNumber: string;
  requestType: CashierBillRequestType;
  sentToCashierAt: string | null;
  sender: { id: string; fullName: string; role?: string | null } | null;
  accountant: { id: string; fullName: string } | null;
  cashier: { id: string; fullName: string } | null;
  departmentOrBranch: string | null;
  recipientName: string;
  basis: string;
  amount: number;
  currency: string;
  exchangeRate: number | null;
  amountKgs: number;
  debitAccountName: string | null;
  debitAccountId: string | null;
  executionStatus: CashierExecutionStatus;
  relatedOrderNumber?: string | null;
  relatedOrderId?: string | null;
  href: string;
};

export function mapTransportExpenseTypeToCashierRequestType(expenseType: string): CashierBillRequestType {
  switch (expenseType) {
    case 'DOMESTIC_CHINA_TRANSPORT':
      return 'CHINA_DOMESTIC_TRANSPORT';
    case 'INTERNATIONAL_FREIGHT':
      return 'CARGO_PAYMENT';
    case 'LOCAL_DELIVERY':
      return 'KYRGYZSTAN_DOMESTIC_TRANSPORT';
    case 'OTHER_LOGISTICS':
      return 'OTHER_PROCUREMENT_EXPENSE';
    default:
      return 'OTHER_PROCUREMENT_EXPENSE';
  }
}

export function normalizeCashierExecutionStatus(
  executionStatus?: string | null,
  paymentStatus?: string | null,
): CashierExecutionStatus {
  const exec = String(executionStatus || '').toUpperCase();
  if ((CASHIER_EXECUTION_STATUSES as readonly string[]).includes(exec)) {
    return exec as CashierExecutionStatus;
  }
  const status = String(paymentStatus || '').toUpperCase();
  if (status === 'ACTIVE' || status === 'PAID') return 'COMPLETED';
  if (status === 'RETURNED') return 'RETURNED_TO_ACCOUNTANT';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'PENDING_CASHIER' || status === 'PARTIALLY_PAID') return 'PENDING_EXECUTION';
  return 'PENDING_EXECUTION';
}

export function isActiveCashierQueueStatus(status: CashierExecutionStatus): boolean {
  return status === 'PENDING_EXECUTION' || status === 'IN_PROGRESS' || status === 'FAILED';
}

export function buildCashierBillsSummary(items: CashierBillListItem[], now = new Date()) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const awaiting = items.filter((item) => item.executionStatus === 'PENDING_EXECUTION');
  const inProgress = items.filter((item) => item.executionStatus === 'IN_PROGRESS');
  const paidToday = items.filter((item) => {
    if (item.executionStatus !== 'COMPLETED' || !item.sentToCashierAt) return false;
    // paid today is tracked via completed items; caller should pass only relevant set
    return true;
  });
  const totalPayableKgs = items
    .filter((item) => isActiveCashierQueueStatus(item.executionStatus))
    .reduce((sum, item) => sum + Math.max(0, item.amountKgs), 0);

  return {
    awaitingCount: awaiting.length,
    inProgressCount: inProgress.length,
    paidTodayCount: paidToday.length,
    totalPayableKgs: Math.round(totalPayableKgs * 100) / 100,
  };
}

/** Summary that separates "paid today" using an explicit paidAt map. */
export function buildCashierBillsSummaryWithPaidAt(
  items: CashierBillListItem[],
  paidAtById: Record<string, string | null | undefined>,
  now = new Date(),
) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const awaiting = items.filter((item) => item.executionStatus === 'PENDING_EXECUTION');
  const inProgress = items.filter((item) => item.executionStatus === 'IN_PROGRESS');
  const paidToday = items.filter((item) => {
    if (item.executionStatus !== 'COMPLETED') return false;
    const paidAt = paidAtById[item.id];
    if (!paidAt) return false;
    return new Date(paidAt) >= startOfDay;
  });
  const totalPayableKgs = items
    .filter((item) => isActiveCashierQueueStatus(item.executionStatus))
    .reduce((sum, item) => sum + Math.max(0, item.amountKgs), 0);

  return {
    awaitingCount: awaiting.length,
    inProgressCount: inProgress.length,
    paidTodayCount: paidToday.length,
    totalPayableKgs: Math.round(totalPayableKgs * 100) / 100,
  };
}

export function matchesCashierBillSearch(item: CashierBillListItem, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.paymentNumber,
    item.requestNumber,
    item.relatedOrderNumber,
    item.recipientName,
    item.basis,
    item.sender?.fullName,
    item.accountant?.fullName,
    item.cashier?.fullName,
    item.departmentOrBranch,
    item.debitAccountName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / safeSize)),
  };
}

export function assertCashierCannotMutateApprovedAmount(input: {
  approvedAmountKgs: number;
  requestedActualPaidKgs?: number | null;
}): number {
  const approved = Math.round(Number(input.approvedAmountKgs || 0) * 100) / 100;
  if (!(approved > 0)) {
    throw new Error('Approved payment amount is missing');
  }
  if (input.requestedActualPaidKgs == null) {
    return approved;
  }
  const requested = Math.round(Number(input.requestedActualPaidKgs) * 100) / 100;
  if (!(requested > 0)) {
    throw new Error('Payment amount must be greater than zero');
  }
  if (requested > approved + 0.009) {
    throw new Error('Cashier cannot change the approved payment amount');
  }
  return requested;
}

export function assertCashierCannotMutateFx(input: {
  storedCurrency: string;
  storedExchangeRate: number | null;
  requestedCurrency?: string | null;
  requestedExchangeRate?: number | null;
}) {
  if (
    input.requestedCurrency != null &&
    String(input.requestedCurrency).toUpperCase() !== String(input.storedCurrency).toUpperCase()
  ) {
    throw new Error('Cashier cannot change the payment currency');
  }
  if (
    input.requestedExchangeRate != null &&
    input.storedExchangeRate != null &&
    Math.abs(Number(input.requestedExchangeRate) - Number(input.storedExchangeRate)) > 0.00009
  ) {
    throw new Error('Cashier cannot change the exchange rate');
  }
}
