import { Prisma } from '@prisma/client';
import { ProcurementSupplierPaymentLedgerStatus } from '@prisma/client';
import { calculateApprovedSupplierKgsFromRate } from './supplier-payment-exchange-rate.util';
import {
  roundCnySettlementDecimal,
  roundMoneyDecimal,
  sumMoneyDecimals,
  toMoneyDecimal,
} from './landed-cost-money.util';
import {
  isConfirmedSupplierPayment,
  resolvePaymentSettledCnyDecimal,
  resolvePurchasePaymentLedgerStatus,
  resolveSupplierPaymentKgsDecimal,
  type SupplierPaymentInput,
} from './supplier-payment.util';

export const SUPPLIER_ALREADY_FULLY_PAID_MESSAGE = 'Этот счёт уже полностью оплачен.';
export const SUPPLIER_PARTIAL_PAYMENT_EXCEEDS_CURRENT_REMAINING_KGS_MESSAGE =
  'Сумма платежа превышает остаток по текущему курсу.';

export type SupplierPaymentMonetaryBalance = {
  obligationYuan: number;
  obligationKgs: number;
  confirmedPaidCny: number;
  confirmedPaidKgs: number;
  remainingCny: number;
  remainingKgs: number;
  isFullyPaid: boolean;
  isPayable: boolean;
};

function resolvePaymentKgsDecimal(payment: SupplierPaymentInput): Prisma.Decimal {
  return resolveSupplierPaymentKgsDecimal(payment);
}

export { resolvePaymentSettledCnyDecimal };

export function resolveSupplierPaymentObligationYuan(totalYuan: number): number {
  return roundMoneyDecimal(Math.max(0, Number(totalYuan || 0)));
}

export function resolveSupplierPaymentMonetaryBalance(input: {
  totalYuan: number;
  exchangeRate: number;
  payments: SupplierPaymentInput[];
}): SupplierPaymentMonetaryBalance {
  const obligationYuan = resolveSupplierPaymentObligationYuan(input.totalYuan);
  const rate = Math.max(0, Number(input.exchangeRate || 0));
  const obligationKgs = rate > 0 ? calculateApprovedSupplierKgsFromRate(obligationYuan, rate) : 0;

  const confirmed = input.payments.filter((payment) => isConfirmedSupplierPayment(payment.status));
  const confirmedPaidCny = roundCnySettlementDecimal(
    sumMoneyDecimals(confirmed.map((payment) => resolvePaymentSettledCnyDecimal(payment))),
  );
  const confirmedPaidKgs = roundMoneyDecimal(
    sumMoneyDecimals(confirmed.map((payment) => resolvePaymentKgsDecimal(payment))),
  );

  const remainingCny = roundCnySettlementDecimal(
    toMoneyDecimal(obligationYuan).minus(toMoneyDecimal(confirmedPaidCny)),
  );
  // Unpaid CNY × current rate — never derive from a 2dp-truncated CNY remainder.
  const remainingKgsFromCny =
    remainingCny > 0 && rate > 0
      ? roundMoneyDecimal(toMoneyDecimal(remainingCny).times(toMoneyDecimal(rate)))
      : 0;
  const remainingKgs = Math.max(remainingKgsFromCny, 0);
  const isFullyPaid = remainingCny <= 0.00000001 && remainingKgs <= 0.009;
  const isPayable = !isFullyPaid && (remainingCny > 0.00000001 || remainingKgs > 0.009);

  return {
    obligationYuan,
    obligationKgs,
    confirmedPaidCny: Math.max(confirmedPaidCny, 0),
    confirmedPaidKgs,
    remainingCny: Math.max(remainingCny, 0),
    remainingKgs,
    isFullyPaid,
    isPayable,
  };
}

export function resolveSupplierPaymentInstructionAmountKgs(input: {
  requestedAmountKgs: number;
  remainingAmountKgs: number;
}): number {
  const remaining = roundMoneyDecimal(input.remainingAmountKgs);
  const requested = roundMoneyDecimal(input.requestedAmountKgs);
  if (requested + 0.009 >= remaining) {
    return remaining;
  }
  const drift = roundMoneyDecimal(remaining - requested);
  if (drift > 0 && drift <= 0.05) {
    return remaining;
  }
  return requested;
}

/** High-precision CNY equivalent of a KGS payment — do NOT truncate to 2dp. */
export function deriveSupplierPaymentYuanFromKgs(input: {
  amountKgs: number;
  exchangeRate: number;
}): number {
  const rate = Number(input.exchangeRate || 0);
  if (!(rate > 0) || !(input.amountKgs > 0)) return 0;
  return roundCnySettlementDecimal(
    toMoneyDecimal(input.amountKgs).div(toMoneyDecimal(rate)),
  );
}

export type SupplierPayRemainderInstruction = {
  amountYuan: number;
  amountKgs: number;
};

/**
 * Closing / pay-remainder instruction.
 * Uses high-precision remaining CNY × current rate for KGS (final 2dp round only).
 * Optional remainingKgs overrides when provided (same-rate residual from obligation − paid).
 */
export function resolveSupplierPayRemainderInstruction(input: {
  remainingCny: number;
  exchangeRate: number;
  remainingKgs?: number | null;
}): SupplierPayRemainderInstruction {
  const remainingCny = roundCnySettlementDecimal(Math.max(0, Number(input.remainingCny || 0)));
  const rate = Number(input.exchangeRate || 0);
  if (!(remainingCny > 0) || !(rate > 0)) {
    return { amountYuan: 0, amountKgs: 0 };
  }
  const fromCny = roundMoneyDecimal(toMoneyDecimal(remainingCny).times(toMoneyDecimal(rate)));
  const providedRemainingKgs =
    input.remainingKgs != null && Number(input.remainingKgs) > 0
      ? roundMoneyDecimal(input.remainingKgs)
      : null;
  const amountKgs = providedRemainingKgs != null ? providedRemainingKgs : fromCny;
  return { amountYuan: remainingCny, amountKgs };
}

/** Remaining CNY obligation converted at the accountant-entered current exchange rate. */
export function resolveSupplierCurrentRemainingKgs(input: {
  remainingCny: number;
  exchangeRate: number;
}): number {
  const remainingCny = roundCnySettlementDecimal(Math.max(0, Number(input.remainingCny || 0)));
  const rate = Number(input.exchangeRate || 0);
  if (!(remainingCny > 0) || !(rate > 0)) {
    return 0;
  }
  return roundMoneyDecimal(toMoneyDecimal(remainingCny).times(toMoneyDecimal(rate)));
}

export function resolveSupplierPartialPaymentInstruction(input: {
  requestedAmountKgs: number;
  remainingCny: number;
  exchangeRate: number;
  remainingKgs?: number | null;
}): SupplierPayRemainderInstruction {
  const requestedKgs = roundMoneyDecimal(Number(input.requestedAmountKgs || 0));
  const remainingCny = roundCnySettlementDecimal(Math.max(0, Number(input.remainingCny || 0)));
  const rate = Number(input.exchangeRate || 0);
  if (!(requestedKgs > 0) || !(rate > 0) || !(remainingCny > 0)) {
    return { amountYuan: 0, amountKgs: 0 };
  }
  const currentRemainingKgs =
    input.remainingKgs != null && Number(input.remainingKgs) > 0
      ? roundMoneyDecimal(input.remainingKgs)
      : resolveSupplierCurrentRemainingKgs({
          remainingCny,
          exchangeRate: rate,
        });
  if (requestedKgs + 0.009 >= currentRemainingKgs) {
    return { amountYuan: remainingCny, amountKgs: currentRemainingKgs };
  }
  const amountYuan = deriveSupplierPaymentYuanFromKgs({
    amountKgs: requestedKgs,
    exchangeRate: rate,
  });
  return { amountYuan, amountKgs: requestedKgs };
}

export function assertSupplierPartialPaymentWithinRemainingKgs(input: {
  paymentAmountKgs: number;
  remainingCny: number;
  exchangeRate: number;
  remainingKgs?: number | null;
}): void {
  const paymentKgs = roundMoneyDecimal(Number(input.paymentAmountKgs || 0));
  const currentRemainingKgs =
    input.remainingKgs != null && Number(input.remainingKgs) > 0
      ? roundMoneyDecimal(input.remainingKgs)
      : resolveSupplierCurrentRemainingKgs({
          remainingCny: input.remainingCny,
          exchangeRate: input.exchangeRate,
        });
  if (paymentKgs > currentRemainingKgs + 0.009) {
    throw new Error(SUPPLIER_PARTIAL_PAYMENT_EXCEEDS_CURRENT_REMAINING_KGS_MESSAGE);
  }
}

/** @deprecated Prefer assertSupplierPartialPaymentWithinRemainingKgs (KGS vs KGS at current rate). */
export function assertSupplierPartialPaymentWithinRemainingCny(input: {
  amountYuan: number;
  remainingCny: number;
}): void {
  const amountYuan = roundCnySettlementDecimal(Number(input.amountYuan || 0));
  const remainingCny = roundCnySettlementDecimal(Math.max(0, Number(input.remainingCny || 0)));
  if (amountYuan > remainingCny + 0.00000001) {
    throw new Error('Сумма частичного платежа превышает остаток.');
  }
}

export function assertSupplierPaymentHasRemainingBalance(
  balance: SupplierPaymentMonetaryBalance,
): void {
  if (balance.isFullyPaid || !balance.isPayable) {
    throw new Error(SUPPLIER_ALREADY_FULLY_PAID_MESSAGE);
  }
}

export function resolveReconciledSupplierPaymentLedgerStatus(input: {
  totalYuan: number;
  exchangeRate: number;
  payments: SupplierPaymentInput[];
  invoiceSentToAccountantAt?: Date | string | null;
  previousStatus?: string | null;
}): ProcurementSupplierPaymentLedgerStatus {
  const balance = resolveSupplierPaymentMonetaryBalance({
    totalYuan: input.totalYuan,
    exchangeRate: input.exchangeRate,
    payments: input.payments,
  });

  if (balance.isFullyPaid) {
    if (balance.confirmedPaidCny > balance.obligationYuan + 0.00000001) {
      return ProcurementSupplierPaymentLedgerStatus.OVERPAID;
    }
    return ProcurementSupplierPaymentLedgerStatus.PAID;
  }

  const pendingCashierCount = input.payments.filter(
    (payment) => String(payment.status ?? '').toUpperCase() === 'PENDING_CASHIER',
  ).length;

  const cnyLedger = resolvePurchasePaymentLedgerStatus({
    totalOrderYuan: balance.obligationYuan,
    totalPaidYuan: balance.confirmedPaidCny,
    remainingYuan: balance.remainingCny,
    pendingCashierCount,
    invoiceSentToAccountantAt: input.invoiceSentToAccountantAt,
    previousStatus: input.previousStatus,
  });

  if (
    (cnyLedger === ProcurementSupplierPaymentLedgerStatus.PAID ||
      cnyLedger === ProcurementSupplierPaymentLedgerStatus.OVERPAID) &&
    balance.remainingKgs > 0.009
  ) {
    return ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID;
  }

  if (balance.isPayable) {
    if (cnyLedger === ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED) {
      return ProcurementSupplierPaymentLedgerStatus.PAYMENT_POSTPONED;
    }
    if (cnyLedger === ProcurementSupplierPaymentLedgerStatus.AWAITING_CASHIER) {
      return ProcurementSupplierPaymentLedgerStatus.AWAITING_CASHIER;
    }
    if (balance.confirmedPaidCny > 0.00000001 || balance.confirmedPaidKgs > 0.009) {
      return ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID;
    }
  }

  return cnyLedger;
}

export function isSupplierPaymentStatusInconsistentWithBalance(input: {
  supplierPaymentStatus?: string | null;
  balance: SupplierPaymentMonetaryBalance;
}): boolean {
  const ledger = String(input.supplierPaymentStatus ?? '').toUpperCase();
  if (
    (ledger === 'PAID' || ledger === 'OVERPAID') &&
    (input.balance.remainingCny > 0.00000001 || input.balance.remainingKgs > 0.009)
  ) {
    return true;
  }
  if (ledger === 'PARTIALLY_PAID' && input.balance.isFullyPaid) {
    return true;
  }
  return false;
}

export function isSupplierCashierRequestKgsPrecisionDrift(input: {
  approvedAmountKgs: number;
  authoritativeRemainingKgs: number;
}): boolean {
  const approved = roundMoneyDecimal(input.approvedAmountKgs);
  const remaining = roundMoneyDecimal(input.authoritativeRemainingKgs);
  if (remaining <= 0.009) return false;
  return Math.abs(approved - remaining) > 0.009 && Math.abs(approved - remaining) <= 0.05;
}
