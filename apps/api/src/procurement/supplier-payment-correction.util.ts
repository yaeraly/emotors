import { ProcurementSupplierPaymentStatus } from '@prisma/client';
import {
  isConfirmedSupplierPayment,
  roundMoney,
  summarizeSupplierPayments,
  type SupplierPaymentInput,
} from './supplier-payment.util';

export const SUPPLIER_PAYMENT_EXCEEDS_REMAINING_MESSAGE =
  'Сумма платежа превышает текущий остаток по счету.';
export const SUPPLIER_INVOICE_CHANGED_AFTER_CORRECTION_MESSAGE =
  'Сумма счета была изменена после исправления. Обновите платежный запрос.';
export const SUPPLIER_CORRECTED_TOTAL_BELOW_PAID_MESSAGE =
  'Новая сумма счета меньше уже подтвержденной оплаты. Требуется финансовая корректировка.';

export const STALE_SUPPLIER_PAYMENT_REQUEST_STATUSES: ProcurementSupplierPaymentStatus[] = [
  ProcurementSupplierPaymentStatus.PENDING_CASHIER,
  ProcurementSupplierPaymentStatus.DRAFT,
  ProcurementSupplierPaymentStatus.RETURNED,
];

export type SupplierLineTotalInput = {
  quantity?: number | string | null;
  purchasePriceYuan?: number | string | null;
  unitPriceYuan?: number | string | null;
  status?: string | null;
};

export type SupplierPaymentBalanceInput = SupplierPaymentInput & {
  id?: string;
};

export type SupplierInvoiceBalanceSnapshot = {
  totalYuan: number;
  confirmedPaidCny: number;
  remainingCny: number;
  inFlightAllocatedCny: number;
};

export function sumSupplierLineTotalYuan(
  items: SupplierLineTotalInput[],
  options?: { excludeCancelled?: boolean },
): number {
  const excludeCancelled = options?.excludeCancelled !== false;
  return roundMoney(
    items.reduce((sum, item) => {
      if (excludeCancelled && String(item.status ?? '').toUpperCase() === 'CANCELLED') {
        return sum;
      }
      const qty = Number(item.quantity ?? 0);
      const price = Number(item.purchasePriceYuan ?? item.unitPriceYuan ?? 0);
      if (!(qty > 0) || !(price >= 0)) return sum;
      return sum + qty * price;
    }, 0),
  );
}

export function resolveSupplierInvoiceBalanceSnapshot(
  totalYuan: number,
  payments: SupplierPaymentBalanceInput[],
  options?: {
    invoiceSentToAccountantAt?: Date | string | null;
    previousStatus?: string | null;
  },
): SupplierInvoiceBalanceSnapshot {
  const summary = summarizeSupplierPayments(payments, totalYuan, options);
  const inFlightAllocatedCny = roundMoney(
    payments
      .filter((payment) =>
        STALE_SUPPLIER_PAYMENT_REQUEST_STATUSES.includes(
          String(payment.status ?? '').toUpperCase() as ProcurementSupplierPaymentStatus,
        ),
      )
      .reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  return {
    totalYuan: roundMoney(totalYuan),
    confirmedPaidCny: summary.totalPaidYuan,
    remainingCny: summary.remainingYuan,
    inFlightAllocatedCny,
  };
}

export function assertCorrectedSupplierTotalCoversPaid(
  newTotalCny: number,
  confirmedPaidCny: number,
): void {
  if (confirmedPaidCny > roundMoney(newTotalCny) + 0.009) {
    throw new Error(SUPPLIER_CORRECTED_TOTAL_BELOW_PAID_MESSAGE);
  }
}

export function assertSupplierPaymentWithinRemaining(input: {
  totalYuan: number;
  payments: SupplierPaymentBalanceInput[];
  amountYuan: number;
  excludePaymentId?: string;
}): SupplierInvoiceBalanceSnapshot {
  const payments = input.payments.filter((payment) => payment.id !== input.excludePaymentId);
  const snapshot = resolveSupplierInvoiceBalanceSnapshot(input.totalYuan, payments);
  const allocatedConfirmed = roundMoney(
    payments
      .filter((payment) => isConfirmedSupplierPayment(payment.status))
      .reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  const allocatedInFlight = roundMoney(
    payments
      .filter((payment) =>
        STALE_SUPPLIER_PAYMENT_REQUEST_STATUSES.includes(
          String(payment.status ?? '').toUpperCase() as ProcurementSupplierPaymentStatus,
        ),
      )
      .reduce((sum, payment) => sum + Number(payment.amountYuan || 0), 0),
  );
  const projected = roundMoney(allocatedConfirmed + allocatedInFlight + input.amountYuan);
  if (projected > roundMoney(input.totalYuan) + 0.009) {
    throw new Error(
      `${SUPPLIER_PAYMENT_EXCEEDS_REMAINING_MESSAGE} Остаток: ${snapshot.remainingCny} CNY`,
    );
  }
  if (input.amountYuan > snapshot.remainingCny + 0.009) {
    throw new Error(
      `${SUPPLIER_PAYMENT_EXCEEDS_REMAINING_MESSAGE} Остаток: ${snapshot.remainingCny} CNY`,
    );
  }
  return snapshot;
}
