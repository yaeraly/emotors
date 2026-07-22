import { TransportExpenseStatus, TransportExpenseType } from '@prisma/client';

export const SECTION_PAYMENT_REQUEST_TYPES = [
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
  'OTHER_EXPENSE',
] as const;

export type SectionPaymentRequestType = (typeof SECTION_PAYMENT_REQUEST_TYPES)[number];

const REQUEST_TYPE_TO_EXPENSE: Record<
  Exclude<SectionPaymentRequestType, 'SUPPLIER_PAYMENT'>,
  TransportExpenseType
> = {
  CHINA_DOMESTIC_TRANSPORT: TransportExpenseType.DOMESTIC_CHINA_TRANSPORT,
  CARGO_PAYMENT: TransportExpenseType.INTERNATIONAL_FREIGHT,
  KYRGYZSTAN_DOMESTIC_TRANSPORT: TransportExpenseType.LOCAL_DELIVERY,
  OTHER_EXPENSE: TransportExpenseType.OTHER_LOGISTICS,
};

const ACTIVE_REQUEST_STATUSES = new Set<string>([
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
]);

const COUNTED_FOR_REMAINING = new Set<string>([
  TransportExpenseStatus.DRAFT,
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
  TransportExpenseStatus.RETURNED,
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAID,
]);

export function expenseTypeForRequestType(
  requestType: Exclude<SectionPaymentRequestType, 'SUPPLIER_PAYMENT'>,
): TransportExpenseType {
  return REQUEST_TYPE_TO_EXPENSE[requestType];
}

export function requestTypeForExpenseType(expenseType: TransportExpenseType): SectionPaymentRequestType | null {
  const entry = Object.entries(REQUEST_TYPE_TO_EXPENSE).find(([, value]) => value === expenseType);
  return (entry?.[0] as SectionPaymentRequestType | undefined) ?? null;
}

export function hasActiveSectionRequest(
  rows: Array<{ status: string }>,
): boolean {
  return rows.some((row) => ACTIVE_REQUEST_STATUSES.has(row.status));
}

export function summarizeSectionPayments(
  rows: Array<{ amount: number | string; amountKgs?: number | string | null; status: string }>,
  sectionTotal?: number | null,
) {
  const counted = rows.filter((row) => COUNTED_FOR_REMAINING.has(row.status) && row.status !== 'CANCELLED');
  const paidRows = rows.filter((row) => row.status === TransportExpenseStatus.PAID);
  const pendingRows = rows.filter((row) => ACTIVE_REQUEST_STATUSES.has(row.status));
  const paidAmount = paidRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const paidAmountKgs = paidRows.reduce((sum, row) => sum + Number(row.amountKgs || 0), 0);
  const outstandingAmount = pendingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const requestedAmount = counted.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const total = Number(sectionTotal || 0) > 0 ? Number(sectionTotal) : requestedAmount;
  const remaining = Math.max(0, Math.round((total - paidAmount) * 100) / 100);
  const status =
    paidAmount <= 0 && pendingRows.length === 0
      ? 'UNPAID'
      : remaining <= 0.009
        ? 'PAID'
        : paidAmount > 0
          ? 'PARTIALLY_PAID'
          : 'AWAITING_ACCOUNTANT';

  return {
    totalRequested: Math.round(total * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    paidAmountKgs: Math.round(paidAmountKgs * 100) / 100,
    remainingAmount: remaining,
    outstandingAmount: Math.round(outstandingAmount * 100) / 100,
    paymentCount: paidRows.length,
    pendingCount: pendingRows.length,
    status,
  };
}

export function validateSectionPayableSubmit(input: {
  amount: number;
  currency?: string | null;
  paymentMethod?: 'BANK_ACCOUNT' | 'QR_CODE' | null;
  accountNumber?: string | null;
  qrCount: number;
  remainingAmount: number;
  hasActiveRequest: boolean;
  procurementOrderId?: string | null;
}) {
  if (!input.procurementOrderId) {
    return 'Procurement Order must exist';
  }
  if (!(input.amount > 0)) {
    return 'Amount must be greater than zero';
  }
  if (!input.currency?.trim()) {
    return 'Currency is required';
  }
  if (!input.paymentMethod) {
    return 'Payment method is required';
  }
  if (input.paymentMethod === 'BANK_ACCOUNT' && !input.accountNumber?.trim()) {
    return 'Account number is required for bank account payment method';
  }
  if (input.paymentMethod === 'QR_CODE' && input.qrCount <= 0) {
    return 'At least one QR attachment is required';
  }
  if (input.hasActiveRequest) {
    return 'An active payment request already exists for this section';
  }
  if (input.remainingAmount > 0 && input.amount > input.remainingAmount + 0.009) {
    return 'Requested amount must not exceed the remaining unpaid amount';
  }
  return null;
}

/** Only PAID expenses affect landed cost. */
export function paidExpensesAffectCost(status: string): boolean {
  return status === TransportExpenseStatus.PAID;
}

export function weightedAverageRate(totalKgs: number, totalCny: number): number | null {
  if (!(totalCny > 0) || !(totalKgs > 0)) return null;
  return Math.round((totalKgs / totalCny) * 10000) / 10000;
}
