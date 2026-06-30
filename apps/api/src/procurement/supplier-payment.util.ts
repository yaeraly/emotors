import { ProcurementSupplierPaymentLedgerStatus, ProcurementSupplierPaymentStatus } from '@prisma/client';

export type SupplierPaymentInput = {
  amountYuan: number;
  exchangeRate: number;
  status?: ProcurementSupplierPaymentStatus;
};

export type SupplierPaymentSummary = {
  totalPaidYuan: number;
  totalPaidKgs: number;
  remainingYuan: number;
  weightedAverageYuanRate: number | null;
  supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus;
};

export function roundMoney(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateAmountKgs(amountYuan: number, exchangeRate: number) {
  return roundMoney(amountYuan * exchangeRate);
}

export function summarizeSupplierPayments(
  payments: SupplierPaymentInput[],
  totalOrderYuan: number,
): SupplierPaymentSummary {
  const active = payments.filter(
    (payment) => (payment.status ?? ProcurementSupplierPaymentStatus.ACTIVE) === ProcurementSupplierPaymentStatus.ACTIVE,
  );
  const totalPaidYuan = roundMoney(
    active.reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  const totalPaidKgs = roundMoney(
    active.reduce(
      (sum, payment) => sum + calculateAmountKgs(Number(payment.amountYuan || 0), Number(payment.exchangeRate || 0)),
      0,
    ),
  );
  const remainingYuan = roundMoney(Math.max(totalOrderYuan - totalPaidYuan, 0));
  const weightedAverageYuanRate =
    totalPaidYuan > 0 ? roundMoney(totalPaidKgs / totalPaidYuan, 4) : null;

  let supplierPaymentStatus: ProcurementSupplierPaymentLedgerStatus =
    ProcurementSupplierPaymentLedgerStatus.UNPAID;
  if (totalPaidYuan <= 0) {
    supplierPaymentStatus = ProcurementSupplierPaymentLedgerStatus.UNPAID;
  } else if (totalPaidYuan > totalOrderYuan) {
    supplierPaymentStatus = ProcurementSupplierPaymentLedgerStatus.OVERPAID;
  } else if (totalPaidYuan >= totalOrderYuan) {
    supplierPaymentStatus = ProcurementSupplierPaymentLedgerStatus.PAID;
  } else {
    supplierPaymentStatus = ProcurementSupplierPaymentLedgerStatus.PARTIALLY_PAID;
  }

  return {
    totalPaidYuan,
    totalPaidKgs,
    remainingYuan,
    weightedAverageYuanRate,
    supplierPaymentStatus,
  };
}
