import { TransportExpenseStatus } from '@prisma/client';
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
  status: string;
};

const CONFIRMED_PAYMENT = new Set(['ACTIVE', 'PAID', 'COMPLETED', 'CONFIRMED']);
const OPEN_EXPENSE = new Set<string>([
  TransportExpenseStatus.DRAFT,
  TransportExpenseStatus.WAITING_ACCOUNTANT,
  TransportExpenseStatus.RETURNED,
  TransportExpenseStatus.PENDING_CASHIER,
  TransportExpenseStatus.PARTIALLY_PAID,
  TransportExpenseStatus.PAID,
]);

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
  if (expense.amountKgs != null && Number(expense.amountKgs) > 0 && expense.status === 'PAID') {
    return roundMoney(Number(expense.amountKgs));
  }
  const rate =
    expense.exchangeRate != null && Number(expense.exchangeRate) > 0
      ? Number(expense.exchangeRate)
      : estimatedYuanRate;
  return roundMoney(amount * Math.max(0, rate));
}

/**
 * Section expense cost uses the FULL requested/approved amount for the section,
 * not only the already-paid portion.
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
  const paidRows = rows.filter((row) => row.status === TransportExpenseStatus.PAID);
  const currency = String(input.defaultCurrency || rows[0]?.currency || 'KGS').toUpperCase();
  const requested = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );
  const sectionTotalAmount = roundMoney(
    Number(input.sectionTotalAmount || 0) > 0 ? Number(input.sectionTotalAmount) : requested,
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
    // Full section amount in KGS is included even if unpaid.
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
