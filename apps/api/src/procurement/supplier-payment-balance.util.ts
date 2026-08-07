import { Prisma } from '@prisma/client';
import { ProcurementSupplierPaymentLedgerStatus } from '@prisma/client';
import { calculateApprovedSupplierKgsFromRate } from './supplier-payment-exchange-rate.util';
import {
  roundMoneyDecimal,
  sumMoneyDecimals,
  toMoneyDecimal,
} from './landed-cost-money.util';
import {
  isConfirmedSupplierPayment,
  resolvePurchasePaymentLedgerStatus,
  type SupplierPaymentInput,
} from './supplier-payment.util';

export const SUPPLIER_ALREADY_FULLY_PAID_MESSAGE = 'Этот счёт уже полностью оплачен.';

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
  const actual = payment.actualPaidKgs;
  if (actual != null && Number(actual) >= 0) {
    return toMoneyDecimal(actual).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  const approved = payment.approvedAmountKgs;
  if (approved != null && Number(approved) >= 0) {
    return toMoneyDecimal(approved).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  const stored = payment.amountKgs;
  if (stored != null && Number(stored) >= 0) {
    return toMoneyDecimal(stored).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  return toMoneyDecimal(Number(payment.amountYuan || 0))
    .times(toMoneyDecimal(Number(payment.exchangeRate || 0)))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

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
  const confirmedPaidCny = roundMoneyDecimal(
    sumMoneyDecimals(confirmed.map((payment) => Number(payment.amountYuan || 0))),
  );
  const confirmedPaidKgs = roundMoneyDecimal(
    sumMoneyDecimals(confirmed.map((payment) => resolvePaymentKgsDecimal(payment))),
  );

  const remainingCny = roundMoneyDecimal(
    toMoneyDecimal(obligationYuan).minus(toMoneyDecimal(confirmedPaidCny)),
  );
  const remainingKgs = roundMoneyDecimal(
    Math.max(
      toMoneyDecimal(obligationKgs).minus(toMoneyDecimal(confirmedPaidKgs)).toNumber(),
      0,
    ),
  );
  const isFullyPaid = remainingCny <= 0.009 && remainingKgs <= 0.009;
  const isPayable = !isFullyPaid && (remainingCny > 0.009 || remainingKgs > 0.009);

  return {
    obligationYuan,
    obligationKgs,
    confirmedPaidCny,
    confirmedPaidKgs,
    remainingCny: Math.max(remainingCny, 0),
    remainingKgs: Math.max(remainingKgs, 0),
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

export function deriveSupplierPaymentYuanFromKgs(input: {
  amountKgs: number;
  exchangeRate: number;
}): number {
  const rate = Number(input.exchangeRate || 0);
  if (!(rate > 0) || !(input.amountKgs > 0)) return 0;
  return roundMoneyDecimal(
    toMoneyDecimal(input.amountKgs).div(toMoneyDecimal(rate)),
  );
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
    if (balance.confirmedPaidCny > balance.obligationYuan + 0.009) {
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
    if (balance.confirmedPaidCny > 0.009 || balance.confirmedPaidKgs > 0.009) {
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
    (input.balance.remainingCny > 0.009 || input.balance.remainingKgs > 0.009)
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
