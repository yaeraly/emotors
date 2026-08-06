import { TransportExpenseStatus } from '@prisma/client';
import {
  isSupplierInvoiceAccountantProcessed,
  isSupplierInvoicePresent,
} from './hq-receiving-validation.util';
import { roundMoney } from './supplier-payment.util';

export type ProcurementCostConfirmationStatus =
  | 'PRELIMINARY'
  | 'PARTIALLY_CONFIRMED'
  | 'ACTUAL';

export type SupplierPaymentCostInput = {
  amountYuan: number;
  exchangeRate?: number | null;
  amountKgs?: number | null;
  actualPaidKgs?: number | null;
  approvedAmountKgs?: number | null;
  status: string;
};

export type SectionExpenseCostInput = {
  amount: number;
  currency?: string | null;
  exchangeRate?: number | null;
  amountKgs?: number | null;
  paidAmountKgs?: number | null;
  status: string;
};

const CONFIRMED_PAYMENT = new Set(['ACTIVE', 'PAID', 'COMPLETED', 'CONFIRMED']);
const OPEN_EXPENSE = new Set<string>([
  TransportExpenseStatus.DRAFT,
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.UNDER_REVIEW,
  TransportExpenseStatus.RETURNED,
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAYMENT_POSTPONED,
  TransportExpenseStatus.PAID,
]);

/** Transport expense statuses approved by HQ Accountant and eligible for landed cost. */
export const APPROVED_EXPENSE_FOR_LANDED_COST = new Set<string>([
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAYMENT_POSTPONED,
  TransportExpenseStatus.PAID,
  'COMPLETED',
  'CONFIRMED',
]);

/** @deprecated Use {@link APPROVED_EXPENSE_FOR_LANDED_COST} */
const OBLIGATION_EXPENSE = APPROVED_EXPENSE_FOR_LANDED_COST;

export function isExpenseApprovedForLandedCost(status: string | null | undefined): boolean {
  return APPROVED_EXPENSE_FOR_LANDED_COST.has(String(status ?? '').toUpperCase());
}

export type SupplierCostInclusionStatus = 'INCLUDED' | 'EXCLUDED';

/** HQ Accountant-approved supplier invoice eligible for procurement cost (not cash-paid). */
export function isSupplierPaymentApprovedForLandedCost(input: {
  invoiceSentToAccountantAt?: Date | string | null;
  supplierInvoiceNumber?: string | null;
  invoiceReviewStatus?: string | null;
  supplierPaymentStatus?: string | null;
}): boolean {
  if (!isSupplierInvoicePresent(input)) return false;
  const review = String(input.invoiceReviewStatus ?? '').toUpperCase();
  if (
    !review ||
    review === 'REJECTED' ||
    review === 'UNDER_REVIEW' ||
    review === 'RETURNED' ||
    review === 'SUBMITTED'
  ) {
    return false;
  }
  if (isSupplierInvoiceAccountantProcessed(input)) return true;
  return review === 'APPROVED';
}

export function resolveSupplierCostInclusionStatus(input: {
  invoiceSentToAccountantAt?: Date | string | null;
  supplierInvoiceNumber?: string | null;
  invoiceReviewStatus?: string | null;
  supplierPaymentStatus?: string | null;
}): SupplierCostInclusionStatus {
  return isSupplierPaymentApprovedForLandedCost(input) ? 'INCLUDED' : 'EXCLUDED';
}

/** Authoritative CNY base for supplier cost — full accountant-approved obligation, not paid cash. */
export function resolveApprovedSupplierCostBaseYuan(input: {
  totalYuan: number;
  requestedPaymentYuan?: number | null;
}): number {
  const total = Math.max(0, Number(input.totalYuan || 0));
  const requested = Math.max(0, Number(input.requestedPaymentYuan ?? 0));
  if (requested > 0) return roundMoney(Math.min(requested, total));
  return roundMoney(total);
}

export function resolveApprovedSupplierAmountKgs(input: {
  totalYuan: number;
  requestedPaymentYuan?: number | null;
  estimatedYuanRate: number;
  estimatedSupplierCostKgs?: number | null;
}): number {
  const rate = Math.max(0, Number(input.estimatedYuanRate || 0));
  const baseYuan = resolveApprovedSupplierCostBaseYuan(input);
  const computed = roundMoney(baseYuan * rate);
  const stored = Number(input.estimatedSupplierCostKgs ?? 0);
  if (stored > 0 && Math.abs(stored - computed) <= 0.05) return roundMoney(stored);
  return computed;
}

export function resolveSupplierInvoicePaymentStatusForCost(
  ledger: string | null | undefined,
): ProcurementImportExpenseLine['paymentStatus'] {
  const normalized = String(ledger ?? '').toUpperCase();
  if (normalized === 'PAYMENT_POSTPONED') return 'POSTPONED';
  if (normalized === 'PAID' || normalized === 'OVERPAID') return 'PAID';
  if (normalized === 'PARTIALLY_PAID') return 'PARTIALLY_PAID';
  return 'UNPAID';
}

export function reconcileSupplierLineCostTotals(input: {
  lineCostKgs: number;
  approvedSupplierAmountKgs: number;
}): { ok: boolean; differenceKgs: number } {
  const differenceKgs = roundMoney(input.lineCostKgs - input.approvedSupplierAmountKgs);
  return { ok: Math.abs(differenceKgs) <= 0.05, differenceKgs };
}

export function resolveTransportExpenseApprovalStatus(
  status: string | null | undefined,
): 'DRAFT' | 'WAITING_FOR_ACCOUNTANT' | 'APPROVED' | 'REJECTED' {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === TransportExpenseStatus.REJECTED || normalized === TransportExpenseStatus.CANCELLED) {
    return 'REJECTED';
  }
  if (normalized === TransportExpenseStatus.DRAFT) return 'DRAFT';
  if (isExpenseApprovedForLandedCost(normalized)) return 'APPROVED';
  return 'WAITING_FOR_ACCOUNTANT';
}

export function resolveTransportExpensePaymentStatus(input: {
  status: string | null | undefined;
  paidAmountKgs?: number | null;
  approvedAmountKgs?: number | null;
}): 'UNPAID' | 'PARTIALLY_PAID' | 'POSTPONED' | 'PAID' {
  const normalized = String(input.status ?? '').toUpperCase();
  if (normalized === TransportExpenseStatus.PAYMENT_POSTPONED) return 'POSTPONED';
  if (normalized === TransportExpenseStatus.PAID || normalized === 'COMPLETED' || normalized === 'CONFIRMED') {
    return 'PAID';
  }
  if (normalized === TransportExpenseStatus.PARTIALLY_PAID) return 'PARTIALLY_PAID';
  const approved = Math.max(0, Number(input.approvedAmountKgs ?? 0));
  const paid = Math.max(0, Number(input.paidAmountKgs ?? 0));
  if (approved > 0 && paid > 0.009 && paid + 0.009 < approved) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

function paymentKgs(payment: SupplierPaymentCostInput): number {
  if (payment.actualPaidKgs != null && Number(payment.actualPaidKgs) > 0) {
    return Number(payment.actualPaidKgs);
  }
  if (payment.approvedAmountKgs != null && Number(payment.approvedAmountKgs) > 0) {
    return Number(payment.approvedAmountKgs);
  }
  if (payment.amountKgs != null && Number(payment.amountKgs) > 0) {
    return Number(payment.amountKgs);
  }
  return roundMoney(Number(payment.amountYuan || 0) * Number(payment.exchangeRate || 0));
}

export function isCompletedSupplierPaymentStatus(status: string): boolean {
  return CONFIRMED_PAYMENT.has(String(status ?? '').toUpperCase());
}

/**
 * Weighted average from completed payments only.
 * Historical payment rates are never overwritten — only aggregated.
 */
export function weightedAveragePaidYuanRate(
  payments: SupplierPaymentCostInput[],
): number | null {
  const completed = payments.filter((payment) => isCompletedSupplierPaymentStatus(payment.status));
  const paidYuan = roundMoney(
    completed.reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  const paidKgs = roundMoney(completed.reduce((sum, payment) => sum + paymentKgs(payment), 0));
  if (!(paidYuan > 0) || !(paidKgs > 0)) return null;
  return roundMoney(paidKgs / paidYuan, 4);
}

/**
 * Effective CNY rate for valuing the FULL procurement amount.
 * - Before first payment: estimated rate
 * - After any payment: weighted average of completed payments
 */
export function resolveCostYuanRate(input: {
  payments: SupplierPaymentCostInput[];
  estimatedYuanRate: number;
}): { rate: number; source: 'ESTIMATED' | 'WEIGHTED_PAID' } {
  const weighted = weightedAveragePaidYuanRate(input.payments);
  if (weighted != null && weighted > 0) {
    return { rate: weighted, source: 'WEIGHTED_PAID' };
  }
  return { rate: Number(input.estimatedYuanRate || 0), source: 'ESTIMATED' };
}

/**
 * Supplier cost always uses the full procurement order CNY amount.
 * Remaining unpaid debt does NOT reduce inventory cost.
 */
export function estimateSupplierCostKgs(input: {
  totalProcurementYuan: number;
  payments: SupplierPaymentCostInput[];
  estimatedYuanRate: number;
}): {
  totalProcurementYuan: number;
  completedPaidYuan: number;
  completedPaidKgs: number;
  remainingYuan: number;
  costYuanRate: number;
  rateSource: 'ESTIMATED' | 'WEIGHTED_PAID';
  estimatedSupplierCostKgs: number;
  isFullyPaid: boolean;
  finalSupplierCostKgs: number | null;
  finalWeightedAverageRate: number | null;
} {
  const totalProcurementYuan = roundMoney(Math.max(0, Number(input.totalProcurementYuan || 0)));
  const completed = input.payments.filter((payment) =>
    isCompletedSupplierPaymentStatus(payment.status),
  );
  const completedPaidYuan = roundMoney(
    completed.reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  const completedPaidKgs = roundMoney(
    completed.reduce((sum, payment) => sum + paymentKgs(payment), 0),
  );
  const remainingYuan = roundMoney(Math.max(totalProcurementYuan - completedPaidYuan, 0));
  const { rate, source } = resolveCostYuanRate({
    payments: input.payments,
    estimatedYuanRate: input.estimatedYuanRate,
  });
  const estimatedSupplierCostKgs = roundMoney(totalProcurementYuan * rate);
  const isFullyPaid = totalProcurementYuan > 0 && remainingYuan <= 0.009 && completedPaidYuan > 0;
  const finalSupplierCostKgs = isFullyPaid ? completedPaidKgs : null;
  const finalWeightedAverageRate =
    isFullyPaid && totalProcurementYuan > 0
      ? roundMoney(completedPaidKgs / totalProcurementYuan, 4)
      : null;

  return {
    totalProcurementYuan,
    completedPaidYuan,
    completedPaidKgs,
    remainingYuan,
    costYuanRate: rate,
    rateSource: source,
    // Inventory / product cost base — NEVER reduced to paid-only amount.
    estimatedSupplierCostKgs: isFullyPaid ? completedPaidKgs : estimatedSupplierCostKgs,
    isFullyPaid,
    finalSupplierCostKgs,
    finalWeightedAverageRate,
  };
}

function expenseAmountKgs(expense: SectionExpenseCostInput, estimatedYuanRate: number): number {
  const currency = String(expense.currency || 'KGS').toUpperCase();
  const amount = Number(expense.amount || 0);
  if (!(amount > 0)) return 0;
  if (currency === 'KGS') return roundMoney(amount);
  if (expense.amountKgs != null && Number(expense.amountKgs) > 0) {
    return roundMoney(Number(expense.amountKgs));
  }
  const rate =
    expense.exchangeRate != null && Number(expense.exchangeRate) > 0
      ? Number(expense.exchangeRate)
      : estimatedYuanRate;
  return roundMoney(amount * Math.max(0, rate));
}

/**
 * Sum approved invoice obligation amounts in inventory base currency (KGS).
 * Uses the full approved/requested amount — never the cash already paid.
 * Only HQ Accountant-approved rows count; draft / waiting / rejected are excluded.
 */
export function sumConfirmedExpenseAmountKgs(
  expenses: SectionExpenseCostInput[],
  estimatedYuanRate: number,
): number {
  return roundMoney(
    expenses.reduce((sum, row) => {
      const status = String(row.status ?? '').toUpperCase();
      if (!isExpenseApprovedForLandedCost(status)) return sum;
      return sum + expenseAmountKgs(row, estimatedYuanRate);
    }, 0),
  );
}

/**
 * Section expense cost uses the FULL requested/approved amount for the section,
 * not only the already-paid portion. Used for payment progress / confirmation status.
 * Inventory landed cost must use {@link sumConfirmedExpenseAmountKgs} instead.
 */
export function estimateSectionExpenseCostKgs(input: {
  expenses: SectionExpenseCostInput[];
  sectionTotalAmount?: number | null;
  estimatedYuanRate: number;
  defaultCurrency?: string;
}): {
  sectionTotalAmount: number;
  paidAmount: number;
  paidAmountKgs: number;
  remainingAmount: number;
  estimatedSectionCostKgs: number;
  usesWeightedPaidRate: boolean;
} {
  const rows = input.expenses.filter((row) => OPEN_EXPENSE.has(String(row.status)));
  const paidRows = rows.filter((row) => {
    const status = String(row.status ?? '').toUpperCase();
    return status === TransportExpenseStatus.PAID || status === 'COMPLETED' || status === 'CONFIRMED';
  });
  const currency = String(input.defaultCurrency || rows[0]?.currency || 'KGS').toUpperCase();
  const requested = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const sectionTotalAmount = roundMoney(
    Math.max(Number(input.sectionTotalAmount || 0), requested),
  );
  const paidAmount = roundMoney(paidRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const paidAmountKgs = roundMoney(
    paidRows.reduce((sum, row) => sum + expenseAmountKgs(row, input.estimatedYuanRate), 0),
  );
  const remainingAmount = roundMoney(Math.max(sectionTotalAmount - paidAmount, 0));

  if (!(sectionTotalAmount > 0)) {
    return {
      sectionTotalAmount: 0,
      paidAmount,
      paidAmountKgs,
      remainingAmount: 0,
      estimatedSectionCostKgs: 0,
      usesWeightedPaidRate: false,
    };
  }

  if (currency === 'KGS') {
    // Full section amount in KGS is included even if unpaid (payment progress view).
    return {
      sectionTotalAmount,
      paidAmount,
      paidAmountKgs,
      remainingAmount,
      estimatedSectionCostKgs: sectionTotalAmount,
      usesWeightedPaidRate: false,
    };
  }

  if (paidAmount > 0 && paidAmountKgs > 0) {
    const weightedRate = roundMoney(paidAmountKgs / paidAmount, 4);
    return {
      sectionTotalAmount,
      paidAmount,
      paidAmountKgs,
      remainingAmount,
      estimatedSectionCostKgs: roundMoney(sectionTotalAmount * weightedRate),
      usesWeightedPaidRate: true,
    };
  }

  return {
    sectionTotalAmount,
    paidAmount,
    paidAmountKgs,
    remainingAmount,
    estimatedSectionCostKgs: roundMoney(sectionTotalAmount * Math.max(0, input.estimatedYuanRate)),
    usesWeightedPaidRate: false,
  };
}

export function resolveProcurementCostConfirmationStatus(input: {
  supplierFullyPaid: boolean;
  supplierHasCompletedPayments: boolean;
  expensesFullyPaid: boolean;
  expensesHaveCompletedPayments: boolean;
}): ProcurementCostConfirmationStatus {
  if (input.supplierFullyPaid && input.expensesFullyPaid) {
    return 'ACTUAL';
  }
  if (input.supplierHasCompletedPayments || input.expensesHaveCompletedPayments) {
    return 'PARTIALLY_CONFIRMED';
  }
  return 'PRELIMINARY';
}

export function expensesFullySettled(
  expenses: Array<{ amount: number; status: string }>,
  sectionTotals: number[],
): boolean {
  const unsettled = new Set<string>([
    TransportExpenseStatus.WAITING_ACCOUNTANT,
    TransportExpenseStatus.PENDING_CASHIER,
    TransportExpenseStatus.PARTIALLY_PAID,
    TransportExpenseStatus.PAYMENT_POSTPONED,
    TransportExpenseStatus.RETURNED,
    TransportExpenseStatus.DRAFT,
  ]);
  const open = expenses.filter((row) => unsettled.has(String(row.status)));
  if (open.length > 0) return false;
  const paid = expenses.filter((row) => row.status === TransportExpenseStatus.PAID);
  if (sectionTotals.every((total) => !(total > 0)) && paid.length === 0) {
    return true;
  }
  const paidAmount = paid.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const required = sectionTotals.reduce((sum, total) => sum + Math.max(0, Number(total || 0)), 0);
  if (!(required > 0)) return open.length === 0;
  return paidAmount + 0.009 >= required;
}

export type ProcurementImportExpenseLine = {
  requestType:
    | 'SUPPLIER_PAYMENT'
    | 'CHINA_DOMESTIC_TRANSPORT'
    | 'CARGO_PAYMENT'
    | 'KYRGYZSTAN_DOMESTIC_TRANSPORT';
  displayName: string;
  expenseType?: string;
  currency: string;
  exchangeRate: number | null;
  approvedAmountKgs: number;
  paidAmountKgs: number;
  remainingAmountKgs: number;
  approvalStatus: 'DRAFT' | 'WAITING_FOR_ACCOUNTANT' | 'APPROVED' | 'REJECTED' | 'NOT_CREATED';
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'POSTPONED' | 'PAID';
  includedInLandedCost: boolean;
};

const IMPORT_EXPENSE_DISPLAY: Record<ProcurementImportExpenseLine['requestType'], string> = {
  SUPPLIER_PAYMENT: 'Платежи поставщику',
  CHINA_DOMESTIC_TRANSPORT: 'Внутренний транспорт Китая',
  CARGO_PAYMENT: 'Оплата карго',
  KYRGYZSTAN_DOMESTIC_TRANSPORT: 'Внутренний транспорт Кыргызстана',
};

export function buildProcurementImportExpenseLines(input: {
  estimatedYuanRate: number;
  supplier?: {
    invoiceSentToAccountantAt?: Date | string | null;
    supplierInvoiceNumber?: string | null;
    invoiceReviewStatus?: string | null;
    supplierPaymentStatus?: string | null;
    totalYuan?: number | null;
    requestedPaymentYuan?: number | null;
    totalPaidYuan?: number | null;
    estimatedSupplierCostKgs?: number | null;
  } | null;
  transportExpenses?: Array<{
    expenseType: string;
    amount: number | string;
    currency?: string | null;
    exchangeRate?: number | string | null;
    amountKgs?: number | string | null;
    paidAmountKgs?: number | string | null;
    status: string;
  }>;
}): ProcurementImportExpenseLine[] {
  const rate = Math.max(0, Number(input.estimatedYuanRate || 0));
  const expenses = input.transportExpenses ?? [];

  const byType = (type: string) =>
    expenses
      .filter((row) => String(row.expenseType) === type)
      .filter((row) => String(row.status).toUpperCase() !== TransportExpenseStatus.CANCELLED)
      .filter((row) => String(row.status).toUpperCase() !== TransportExpenseStatus.DRAFT)
      .map((row) => ({
        amount: Number(row.amount || 0),
        currency: row.currency,
        exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
        amountKgs: row.amountKgs != null ? Number(row.amountKgs) : null,
        paidAmountKgs: row.paidAmountKgs != null ? Number(row.paidAmountKgs) : null,
        status: row.status,
      }));

  function transportLine(
    requestType: ProcurementImportExpenseLine['requestType'],
    expenseType: string,
    defaultCurrency: string,
  ): ProcurementImportExpenseLine {
    const rows = byType(expenseType);
    const approvedAmountKgs = sumConfirmedExpenseAmountKgs(rows, rate);
    const dominant = rows.find((row) => isExpenseApprovedForLandedCost(row.status)) ?? rows[0];
    const approvalStatus: ProcurementImportExpenseLine['approvalStatus'] =
      rows.length === 0
        ? 'NOT_CREATED'
        : rows.every((row) => resolveTransportExpenseApprovalStatus(row.status) === 'REJECTED')
          ? 'REJECTED'
          : rows.some((row) => isExpenseApprovedForLandedCost(row.status))
            ? 'APPROVED'
            : 'WAITING_FOR_ACCOUNTANT';
    const paidAmountKgs = roundMoney(
      rows.reduce((sum, row) => sum + Math.max(0, Number(row.paidAmountKgs ?? 0)), 0),
    );
    const paymentStatus = dominant
      ? resolveTransportExpensePaymentStatus({
          status: dominant.status,
          paidAmountKgs,
          approvedAmountKgs,
        })
      : 'UNPAID';
    return {
      requestType,
      displayName: IMPORT_EXPENSE_DISPLAY[requestType],
      expenseType,
      currency: String(dominant?.currency || defaultCurrency).toUpperCase(),
      exchangeRate: dominant?.exchangeRate ?? (defaultCurrency === 'CNY' ? rate : null),
      approvedAmountKgs,
      paidAmountKgs,
      remainingAmountKgs: roundMoney(Math.max(approvedAmountKgs - paidAmountKgs, 0)),
      approvalStatus,
      paymentStatus,
      includedInLandedCost: approvalStatus === 'APPROVED' && approvedAmountKgs > 0,
    };
  }

  const supplier = input.supplier;
  const supplierPresent = isSupplierInvoicePresent({
    invoiceSentToAccountantAt: supplier?.invoiceSentToAccountantAt,
    supplierInvoiceNumber: supplier?.supplierInvoiceNumber,
  });
  const supplierReview = String(supplier?.invoiceReviewStatus ?? '').toUpperCase();
  const supplierLedger = String(supplier?.supplierPaymentStatus ?? '').toUpperCase();
  const supplierApproved = isSupplierPaymentApprovedForLandedCost({
    invoiceSentToAccountantAt: supplier?.invoiceSentToAccountantAt,
    supplierInvoiceNumber: supplier?.supplierInvoiceNumber,
    invoiceReviewStatus: supplier?.invoiceReviewStatus,
    supplierPaymentStatus: supplier?.supplierPaymentStatus,
  });
  const supplierApprovedKgs = supplierApproved
    ? resolveApprovedSupplierAmountKgs({
        totalYuan: Number(supplier?.totalYuan ?? 0),
        requestedPaymentYuan:
          supplier?.requestedPaymentYuan != null ? Number(supplier.requestedPaymentYuan) : null,
        estimatedYuanRate: rate,
        estimatedSupplierCostKgs: supplier?.estimatedSupplierCostKgs,
      })
    : 0;
  const supplierPaidKgs = roundMoney(Math.max(0, Number(supplier?.totalPaidYuan ?? 0) * rate));
  const supplierLine: ProcurementImportExpenseLine = {
    requestType: 'SUPPLIER_PAYMENT',
    displayName: IMPORT_EXPENSE_DISPLAY.SUPPLIER_PAYMENT,
    currency: 'CNY',
    exchangeRate: rate > 0 ? rate : null,
    approvedAmountKgs: supplierApprovedKgs,
    paidAmountKgs: supplierPaidKgs,
    remainingAmountKgs: roundMoney(Math.max(supplierApprovedKgs - supplierPaidKgs, 0)),
    approvalStatus: !supplierPresent
      ? 'NOT_CREATED'
      : supplierReview === 'REJECTED'
        ? 'REJECTED'
        : supplierApproved
          ? 'APPROVED'
          : 'WAITING_FOR_ACCOUNTANT',
    paymentStatus: resolveSupplierInvoicePaymentStatusForCost(supplierLedger),
    includedInLandedCost: supplierApproved && supplierApprovedKgs > 0,
  };

  return [
    supplierLine,
    transportLine('CHINA_DOMESTIC_TRANSPORT', 'DOMESTIC_CHINA_TRANSPORT', 'CNY'),
    transportLine('CARGO_PAYMENT', 'INTERNATIONAL_FREIGHT', 'KGS'),
    transportLine('KYRGYZSTAN_DOMESTIC_TRANSPORT', 'LOCAL_DELIVERY', 'KGS'),
  ];
}
