/**
 * Unified HQ Accountant "Счета к оплате" view-model helpers.
 * Aggregates existing payment-request sources without a duplicate Prisma model.
 */

export const ACCOUNTANT_BILL_REQUEST_TYPES = [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
  'OTHER_PROCUREMENT_EXPENSE',
  'PRODUCT_PURCHASE',
  'SERVICE_PAYMENT',
  'EMPLOYEE_REIMBURSEMENT',
  'OTHER_EXPENSE',
] as const;

export type AccountantBillRequestType = (typeof ACCOUNTANT_BILL_REQUEST_TYPES)[number];

export const ACCOUNTANT_BILL_UI_STATUSES = [
  'AWAITING_ACCOUNTANT',
  'UNDER_REVIEW',
  'RETURNED',
  'APPROVED',
  'PARTIALLY_PAID',
  'PAYMENT_POSTPONED',
  'FULLY_PAID',
  'REJECTED',
  'CANCELLED',
] as const;

export type AccountantBillUiStatus = (typeof ACCOUNTANT_BILL_UI_STATUSES)[number];

export type AccountantBillSource = 'SUPPLIER_INVOICE' | 'TRANSPORT_EXPENSE' | 'FINANCE_EXPENSE';

export type AccountantBillCorrectionRouting = {
  direction: 'FROM_CASHIER' | 'TO_SUPPLY_MANAGER';
  userId?: string;
  userName?: string;
  userLogin?: string;
};

export type AccountantBillListItem = {
  id: string;
  source: AccountantBillSource;
  requestNumber: string;
  requestType: AccountantBillRequestType;
  submittedAt: string | null;
  sender: { id: string; fullName: string; role?: string | null } | null;
  departmentOrBranch: string | null;
  recipientName: string;
  basis: string;
  amount: number;
  currency: string;
  estimatedAmountKgs: number;
  paidAmount: number;
  paidAmountKgs: number;
  remainingAmount: number;
  remainingAmountKgs: number;
  status: AccountantBillUiStatus;
  isOverdue: boolean;
  nextPaymentDate?: string | null;
  paymentPostponeComment?: string | null;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedOrderNumber?: string | null;
  href: string;
  correctionRouting?: AccountantBillCorrectionRouting;
};

export function mapTransportExpenseTypeToRequestType(expenseType: string): AccountantBillRequestType {
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
      return 'OTHER_EXPENSE';
  }
}

export function mapFinanceCategoryToRequestType(category: string): AccountantBillRequestType {
  const value = String(category || '').toUpperCase();
  if (value.includes('PRODUCT') || value.includes('GOODS') || value.includes('ТОВАР')) {
    return 'PRODUCT_PURCHASE';
  }
  if (value.includes('SERVICE') || value.includes('УСЛУГ')) {
    return 'SERVICE_PAYMENT';
  }
  if (value.includes('REIMBURSE') || value.includes('ВОЗМЕЩ') || value.includes('EMPLOYEE')) {
    return 'EMPLOYEE_REIMBURSEMENT';
  }
  return 'OTHER_EXPENSE';
}

export function mapTransportStatusToUi(status: string): AccountantBillUiStatus {
  switch (status) {
    case 'WAITING_ACCOUNTANT':
      return 'AWAITING_ACCOUNTANT';
    case 'UNDER_REVIEW':
      return 'UNDER_REVIEW';
    case 'RETURNED':
      return 'RETURNED';
    case 'REJECTED':
      return 'REJECTED';
    case 'PENDING_CASHIER':
      return 'APPROVED';
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID';
    case 'PAYMENT_POSTPONED':
      return 'PAYMENT_POSTPONED';
    case 'PAID':
      return 'FULLY_PAID';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'AWAITING_ACCOUNTANT';
  }
}

export function mapSupplierInvoiceToUi(input: {
  invoiceReviewStatus?: string | null;
  supplierPaymentStatus?: string | null;
  remainingYuan?: number;
}): AccountantBillUiStatus {
  const review = String(input.invoiceReviewStatus || '').toUpperCase();
  if (review === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (review === 'RETURNED') return 'RETURNED';
  if (review === 'REJECTED') return 'REJECTED';
  const ledger = String(input.supplierPaymentStatus || '').toUpperCase();
  if (ledger === 'PAID' || ledger === 'OVERPAID') return 'FULLY_PAID';
  if (ledger === 'PARTIALLY_PAID') return 'PARTIALLY_PAID';
  if (ledger === 'PAYMENT_POSTPONED') return 'PAYMENT_POSTPONED';
  // Sent to HQ Cashier — same UI bucket as cargo PENDING_CASHIER → APPROVED.
  if (ledger === 'AWAITING_CASHIER') return 'APPROVED';
  // Costing/review "APPROVED" without cashier handoff still needs the four accountant actions.
  if (
    ledger === 'AWAITING_ACCOUNTANT' ||
    ledger === 'UNPAID' ||
    review === 'SUBMITTED' ||
    review === 'APPROVED' ||
    (input.remainingYuan ?? 0) > 0.009
  ) {
    return 'AWAITING_ACCOUNTANT';
  }
  return 'AWAITING_ACCOUNTANT';
}

/** Positive remaining for action visibility — prefer KGS, fall back to source currency amount. */
export function resolveAccountantBillRemainingForActions(input: {
  remainingAmountKgs?: number | null;
  remainingAmount?: number | null;
}): number {
  const kgs = Number(input.remainingAmountKgs);
  if (Number.isFinite(kgs) && kgs > 0.009) return kgs;
  const amount = Number(input.remainingAmount);
  if (Number.isFinite(amount) && amount > 0.009) return amount;
  return Math.max(0, Number.isFinite(kgs) ? kgs : 0);
}

export function mapFinanceExpenseStatusToUi(status: string): AccountantBillUiStatus {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'AWAITING_ACCOUNTANT';
    case 'APPROVED':
      return 'APPROVED';
    case 'PAID':
      return 'FULLY_PAID';
    case 'REJECTED':
      return 'REJECTED';
    default:
      return 'AWAITING_ACCOUNTANT';
  }
}

export function estimateKgsAmount(amount: number, currency: string, exchangeRate?: number | null): number {
  const value = Number(amount || 0);
  if (!(value > 0)) return 0;
  const cur = String(currency || 'KGS').toUpperCase();
  if (cur === 'KGS') return Math.round(value * 100) / 100;
  const rate = Number(exchangeRate || 0);
  if (!(rate > 0)) return 0;
  return Math.round(value * rate * 100) / 100;
}

export function buildAccountantBillsSummary(items: AccountantBillListItem[]) {
  const awaiting = items.filter((item) => item.status === 'AWAITING_ACCOUNTANT' || item.status === 'UNDER_REVIEW');
  const partial = items.filter((item) => item.status === 'PARTIALLY_PAID');
  const postponed = items.filter((item) => item.status === 'PAYMENT_POSTPONED');
  const overdue = items.filter((item) => item.isOverdue && item.remainingAmountKgs > 0.009);
  const totalPayableKgs = items
    .filter((item) => !['FULLY_PAID', 'REJECTED', 'CANCELLED'].includes(item.status))
    .reduce((sum, item) => sum + Math.max(0, item.remainingAmountKgs), 0);

  return {
    awaitingCount: awaiting.length,
    partiallyPaidCount: partial.length,
    postponedCount: postponed.length,
    overdueCount: overdue.length,
    totalPayableKgs: Math.round(totalPayableKgs * 100) / 100,
  };
}

export function matchesBillSearch(item: AccountantBillListItem, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.requestNumber,
    item.relatedOrderNumber,
    item.recipientName,
    item.basis,
    item.sender?.fullName,
    item.departmentOrBranch,
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
