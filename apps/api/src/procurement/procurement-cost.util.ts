import { TransportExpenseStatus, Prisma } from '@prisma/client';
import {
  isSupplierInvoiceAccountantProcessed,
  isSupplierInvoicePresent,
} from './hq-receiving-validation.util';
import {
  roundCnySettlementDecimal,
  roundMoneyDecimal,
  sumMoneyDecimals,
  toMoneyDecimal,
} from './landed-cost-money.util';
import {
  isConfirmedSupplierPayment,
  resolvePaymentSettledCnyDecimal,
  resolveSupplierPaymentKgsDecimal,
  roundMoney,
} from './supplier-payment.util';

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
  id?: string;
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
  if (review === 'REJECTED' || review === 'RETURNED') return false;
  // Accountant-processed ledger (partial / postponed / paid) is eligible even if review lagged.
  if (isSupplierInvoiceAccountantProcessed(input)) return true;
  if (!review || review === 'UNDER_REVIEW' || review === 'SUBMITTED') return false;
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

function paymentKgsDecimal(payment: SupplierPaymentCostInput) {
  return resolveSupplierPaymentKgsDecimal(payment);
}

function paymentKgs(payment: SupplierPaymentCostInput): number {
  return roundMoneyDecimal(paymentKgsDecimal(payment));
}

export function mapSupplierPaymentsForCosting(
  payments: Array<{
    id?: string;
    amountYuan: number | string | Prisma.Decimal;
    exchangeRate?: number | string | Prisma.Decimal | null;
    amountKgs?: number | string | Prisma.Decimal | null;
    actualPaidKgs?: number | string | Prisma.Decimal | null;
    approvedAmountKgs?: number | string | Prisma.Decimal | null;
    status: string;
  }>,
): SupplierPaymentCostInput[] {
  return payments.map((payment) => ({
    id: payment.id,
    amountYuan: Number(payment.amountYuan),
    exchangeRate: payment.exchangeRate != null ? Number(payment.exchangeRate) : null,
    amountKgs: payment.amountKgs != null ? Number(payment.amountKgs) : null,
    actualPaidKgs: payment.actualPaidKgs != null ? Number(payment.actualPaidKgs) : null,
    approvedAmountKgs:
      payment.approvedAmountKgs != null ? Number(payment.approvedAmountKgs) : null,
    status: payment.status,
  }));
}

export function isCompletedSupplierPaymentStatus(status: string): boolean {
  return isConfirmedSupplierPayment(status);
}

/**
 * Weighted average from completed payments only.
 * Historical payment rates are never overwritten — only aggregated.
 */
export function weightedAveragePaidYuanRate(
  payments: SupplierPaymentCostInput[],
): number | null {
  const completed = payments.filter((payment) => isCompletedSupplierPaymentStatus(payment.status));
  const paidYuan = roundCnySettlementDecimal(
    sumMoneyDecimals(completed.map((payment) => resolvePaymentSettledCnyDecimal(payment))),
  );
  const paidKgs = roundMoneyDecimal(
    sumMoneyDecimals(completed.map((payment) => paymentKgsDecimal(payment))),
  );
  if (!(paidYuan > 0) || !(paidKgs > 0)) return null;
  return toMoneyDecimal(paidKgs)
    .div(toMoneyDecimal(paidYuan))
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
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
  const completedPaidYuan = roundCnySettlementDecimal(
    sumMoneyDecimals(completed.map((payment) => resolvePaymentSettledCnyDecimal(payment))),
  );
  const completedPaidKgs = roundMoneyDecimal(
    sumMoneyDecimals(completed.map((payment) => paymentKgsDecimal(payment))),
  );
  const remainingYuan = roundMoney(Math.max(totalProcurementYuan - completedPaidYuan, 0));
  const weightedRate = weightedAveragePaidYuanRate(input.payments);
  const { rate, source } = resolveCostYuanRate({
    payments: input.payments,
    estimatedYuanRate: input.estimatedYuanRate,
  });
  const isFullyPaid =
    totalProcurementYuan > 0 && remainingYuan <= 0.009 && completedPaidYuan > 0;
  const estimatedSupplierCostKgs = isFullyPaid
    ? completedPaidKgs
    : completedPaidYuan > 0
      ? roundMoneyDecimal(
          toMoneyDecimal(completedPaidKgs).plus(
            toMoneyDecimal(remainingYuan).times(toMoneyDecimal(rate)),
          ),
        )
      : roundMoney(totalProcurementYuan * rate);
  const finalSupplierCostKgs = isFullyPaid ? completedPaidKgs : null;
  const finalWeightedAverageRate = weightedRate;

  return {
    totalProcurementYuan,
    completedPaidYuan,
    completedPaidKgs,
    remainingYuan,
    costYuanRate: rate,
    rateSource: source,
    estimatedSupplierCostKgs,
    isFullyPaid,
    finalSupplierCostKgs,
    finalWeightedAverageRate,
  };
}

/** Shared authoritative supplier purchase cost + weighted rate for UI and landed cost. */
export function resolveAuthoritativeSupplierPurchaseCost(input: {
  totalProcurementYuan: number;
  payments: SupplierPaymentCostInput[];
  estimatedYuanRate: number;
}) {
  const costing = estimateSupplierCostKgs(input);
  return {
    ...costing,
    weightedAverageYuanRate: costing.finalWeightedAverageRate,
    authoritativeSupplierPurchaseCostKgs: costing.estimatedSupplierCostKgs,
    effectiveYuanRate: costing.costYuanRate,
  };
}

/** Deduplicate section expenses by authoritative expense id (guards join multiplication). */
export function dedupeSectionExpensesById<T extends SectionExpenseCostInput>(expenses: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const row of expenses) {
    const id = row.id?.trim();
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    deduped.push(row);
  }
  return deduped;
}

export function hasApprovedSectionExpenses(expenses: SectionExpenseCostInput[]): boolean {
  return dedupeSectionExpensesById(expenses).some((row) =>
    isExpenseApprovedForLandedCost(row.status),
  );
}

/**
 * When HQ Accountant-approved section expenses exist, their deduped sum is authoritative.
 * Otherwise fall back to the stored order scalar (pre-invoice planning values).
 */
export function resolveSectionCostKgsFromApprovedExpenses(input: {
  confirmedFromExpenses: number;
  storedOrderKgs: number;
  hasApprovedExpenseRows: boolean;
}): number {
  if (input.hasApprovedExpenseRows && input.confirmedFromExpenses > 0) {
    return input.confirmedFromExpenses;
  }
  return Math.max(input.confirmedFromExpenses, input.storedOrderKgs);
}

function expenseAmountKgs(expense: SectionExpenseCostInput, estimatedYuanRate: number): number {
  const currency = String(expense.currency || 'KGS').toUpperCase();
  const amount = toMoneyDecimal(expense.amount || 0);
  if (amount.lte(0)) return 0;
  if (currency === 'KGS') return roundMoneyDecimal(amount);
  if (expense.amountKgs != null && Number(expense.amountKgs) > 0) {
    return roundMoneyDecimal(expense.amountKgs);
  }
  const rate =
    expense.exchangeRate != null && Number(expense.exchangeRate) > 0
      ? toMoneyDecimal(expense.exchangeRate)
      : toMoneyDecimal(Math.max(0, estimatedYuanRate));
  return roundMoneyDecimal(amount.mul(rate));
}

/** Convert a procurement section budget scalar to KGS for landed-cost caps. */
export function resolveSectionBudgetCapKgs(input: {
  sectionTotalAmount?: number | null;
  sectionCurrency?: string | null;
  estimatedYuanRate: number;
}): number | null {
  const amount = Number(input.sectionTotalAmount || 0);
  if (!(amount > 0)) return null;
  const currency = String(input.sectionCurrency || 'KGS').toUpperCase();
  if (currency === 'CNY') {
    return roundMoneyDecimal(
      toMoneyDecimal(amount).mul(toMoneyDecimal(Math.max(0, input.estimatedYuanRate))),
    );
  }
  return roundMoneyDecimal(amount);
}

function sumApprovedExpenseRowsAmountKgs(
  expenses: SectionExpenseCostInput[],
  estimatedYuanRate: number,
): { summed: number; amounts: number[]; approvedCount: number } {
  const deduped = dedupeSectionExpensesById(expenses);
  const amounts: number[] = [];
  for (const row of deduped) {
    const status = String(row.status ?? '').toUpperCase();
    if (!isExpenseApprovedForLandedCost(status)) continue;
    amounts.push(expenseAmountKgs(row, estimatedYuanRate));
  }
  return {
    summed: roundMoneyDecimal(amounts.reduce((sum, value) => sum + value, 0)),
    amounts,
    approvedCount: amounts.length,
  };
}

/**
 * Sum approved invoice obligation amounts in inventory base currency (KGS).
 * Uses the full approved/requested amount — never the cash already paid.
 * Only HQ Accountant-approved rows count; draft / waiting / rejected are excluded.
 * Each expense id is counted at most once.
 */
export function sumConfirmedExpenseAmountKgs(
  expenses: SectionExpenseCostInput[],
  estimatedYuanRate: number,
): number {
  return sumApprovedExpenseRowsAmountKgs(expenses, estimatedYuanRate).summed;
}

/**
 * Sum approved section expenses for landed cost, capped at the section budget.
 * Prevents duplicate full-section invoices (e.g. 3× 600 CNY china transport) from
 * inflating inventory cost while still allowing intentional partial payments.
 */
export function sumSectionConfirmedExpenseAmountKgs(
  expenses: SectionExpenseCostInput[],
  estimatedYuanRate: number,
  options?: {
    sectionTotalAmount?: number | null;
    sectionCurrency?: string | null;
  },
): number {
  const { summed, amounts } = sumApprovedExpenseRowsAmountKgs(expenses, estimatedYuanRate);
  const cap = resolveSectionBudgetCapKgs({
    sectionTotalAmount: options?.sectionTotalAmount,
    sectionCurrency: options?.sectionCurrency,
    estimatedYuanRate,
  });
  if (cap == null || !(cap > 0)) return summed;
  if (summed <= cap + 0.009) return summed;

  if (amounts.length > 1) {
    const first = amounts[0] ?? 0;
    const identicalFullSectionDuplicates =
      amounts.every((value) => Math.abs(value - first) <= 0.05) && Math.abs(first - cap) <= 0.05;
    if (identicalFullSectionDuplicates) return cap;
  }

  return Math.min(summed, cap);
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
  const rows = dedupeSectionExpensesById(input.expenses.filter((row) => OPEN_EXPENSE.has(String(row.status))));
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
    totalPaidKgs?: number | null;
    estimatedSupplierCostKgs?: number | null;
  } | null;
  transportExpenses?: Array<{
    id?: string;
    expenseType: string;
    amount: number | string;
    currency?: string | null;
    exchangeRate?: number | string | null;
    amountKgs?: number | string | null;
    paidAmountKgs?: number | string | null;
    status: string;
  }>;
  sectionBudgets?: Partial<
    Record<string, { totalAmount?: number | null; currency?: string | null }>
  >;
}): ProcurementImportExpenseLine[] {
  const rate = Math.max(0, Number(input.estimatedYuanRate || 0));
  const expenses = input.transportExpenses ?? [];

  const byType = (type: string) =>
    dedupeSectionExpensesById(
      expenses
        .filter((row) => String(row.expenseType) === type)
        .filter((row) => String(row.status).toUpperCase() !== TransportExpenseStatus.CANCELLED)
        .filter((row) => String(row.status).toUpperCase() !== TransportExpenseStatus.DRAFT)
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          currency: row.currency,
          exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
          amountKgs: row.amountKgs != null ? Number(row.amountKgs) : null,
          paidAmountKgs: row.paidAmountKgs != null ? Number(row.paidAmountKgs) : null,
          status: row.status,
        })),
    );

  function transportLine(
    requestType: ProcurementImportExpenseLine['requestType'],
    expenseType: string,
    defaultCurrency: string,
  ): ProcurementImportExpenseLine {
    const rows = byType(expenseType);
    const sectionBudget = input.sectionBudgets?.[expenseType];
    const approvedAmountKgs = sumSectionConfirmedExpenseAmountKgs(rows, rate, {
      sectionTotalAmount: sectionBudget?.totalAmount,
      sectionCurrency: sectionBudget?.currency ?? defaultCurrency,
    });
    const dominant = rows.find((row) => isExpenseApprovedForLandedCost(row.status)) ?? rows[0];
    const approvalStatus: ProcurementImportExpenseLine['approvalStatus'] =
      rows.length === 0
        ? 'NOT_CREATED'
        : rows.every((row) => resolveTransportExpenseApprovalStatus(row.status) === 'REJECTED')
          ? 'REJECTED'
          : rows.some((row) => isExpenseApprovedForLandedCost(row.status))
            ? 'APPROVED'
            : 'WAITING_FOR_ACCOUNTANT';
    const paidAmountKgs = roundMoneyDecimal(
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
  const supplierPaidKgs =
    supplier?.totalPaidKgs != null && Number(supplier.totalPaidKgs) > 0
      ? roundMoney(Number(supplier.totalPaidKgs))
      : roundMoney(Math.max(0, Number(supplier?.totalPaidYuan ?? 0) * rate));
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
