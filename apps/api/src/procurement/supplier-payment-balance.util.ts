import { ProcurementSupplierPaymentLedgerStatus } from '@prisma/client';
import { calculateApprovedSupplierKgsFromRate } from './supplier-payment-exchange-rate.util';
import {
  isConfirmedSupplierPayment,
  resolvePurchasePaymentLedgerStatus,
  resolveSupplierPaymentKgs,
  roundMoney,
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

export function resolveSupplierPaymentObligationYuan(totalYuan: number): number {
  return roundMoney(Math.max(0, Number(totalYuan || 0)));
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
  const confirmedPaidCny = roundMoney(
    confirmed.reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  const confirmedPaidKgs = roundMoney(
    confirmed.reduce((sum, payment) => sum + resolveSupplierPaymentKgs(payment), 0),
  );

  const remainingCny = roundMoney(Math.max(obligationYuan - confirmedPaidCny, 0));
  const remainingKgs = roundMoney(Math.max(obligationKgs - confirmedPaidKgs, 0));
  const isFullyPaid = remainingCny <= 0.009 && remainingKgs <= 0.009;
  const isPayable = !isFullyPaid && (remainingCny > 0.009 || remainingKgs > 0.009);

  return {
    obligationYuan,
    obligationKgs,
    confirmedPaidCny,
    confirmedPaidKgs,
    remainingCny,
    remainingKgs,
    isFullyPaid,
    isPayable,
  };
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
  if (
    ledger === 'PARTIALLY_PAID' &&
    input.balance.isFullyPaid
  ) {
    return true;
  }
  return false;
}
