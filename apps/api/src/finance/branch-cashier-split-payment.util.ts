import { BadRequestException } from '@nestjs/common';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

export const BRANCH_SPLIT_PAYMENT_AUDIT = {
  SPLIT_PAYMENT_CONFIRMED: 'BRANCH_SPLIT_PAYMENT_CONFIRMED',
  CASH_PAYMENT_POSTED: 'BRANCH_CASH_PAYMENT_POSTED',
  QR_PAYMENT_POSTED: 'BRANCH_QR_PAYMENT_POSTED',
  INVOICE_PAID: 'BRANCH_INVOICE_PAID',
  INSTALLMENT_PAYMENT_RECEIVED: 'BRANCH_INSTALLMENT_PAYMENT_RECEIVED',
} as const;

export const BRANCH_SPLIT_PAYMENT_ERRORS = {
  NO_METHOD_AMOUNT: 'Введите сумму хотя бы для одного способа оплаты.',
  FULL_PAYMENT_UNDER: 'Общая сумма платежа меньше суммы полной оплаты.',
  INSTALLMENT_OVER: 'Сумма погашения превышает остаток рассрочки.',
  QR_OVER_PAYABLE: 'Сумма QR-оплаты не может превышать сумму к оплате.',
} as const;

export type SplitPaymentAllocation = {
  cashGrossAmount: number;
  qrGrossAmount: number;
  cashNetAmount: number;
  qrNetAmount: number;
  cashChangeAmount: number;
  totalEntered: number;
  totalNetAmount: number;
  remainingAfterPayment: number;
};

export function isSplitCashierPaymentInput(input: {
  cashAmount?: number | null;
  qrAmount?: number | null;
}) {
  return roundDisplayMoney(Number(input.cashAmount ?? 0)) > 0 ||
    roundDisplayMoney(Number(input.qrAmount ?? 0)) > 0;
}

export function resolveSplitCashierPayment(input: {
  payableAmount: number;
  isFullPayment: boolean;
  cashGrossAmount: number;
  qrGrossAmount: number;
}): SplitPaymentAllocation {
  const payableAmount = roundDisplayMoney(input.payableAmount);
  const cashGrossAmount = roundDisplayMoney(input.cashGrossAmount);
  const qrGrossAmount = roundDisplayMoney(input.qrGrossAmount);
  const totalEntered = roundDisplayMoney(cashGrossAmount + qrGrossAmount);

  if (cashGrossAmount <= 0 && qrGrossAmount <= 0) {
    throw new BadRequestException(BRANCH_SPLIT_PAYMENT_ERRORS.NO_METHOD_AMOUNT);
  }

  if (qrGrossAmount > payableAmount + 0.009) {
    throw new BadRequestException(BRANCH_SPLIT_PAYMENT_ERRORS.QR_OVER_PAYABLE);
  }

  const qrNetAmount = qrGrossAmount;
  const remainingAfterQr = roundDisplayMoney(Math.max(payableAmount - qrNetAmount, 0));

  let cashChangeAmount = 0;
  let cashNetAmount = 0;

  if (input.isFullPayment) {
    if (totalEntered + 0.009 < payableAmount) {
      throw new BadRequestException(BRANCH_SPLIT_PAYMENT_ERRORS.FULL_PAYMENT_UNDER);
    }
    cashChangeAmount = roundDisplayMoney(Math.max(cashGrossAmount - remainingAfterQr, 0));
    cashNetAmount = roundDisplayMoney(cashGrossAmount - cashChangeAmount);
  } else {
    if (totalEntered > payableAmount + 0.009) {
      cashNetAmount = roundDisplayMoney(Math.max(payableAmount - qrNetAmount, 0));
      cashChangeAmount = roundDisplayMoney(Math.max(cashGrossAmount - cashNetAmount, 0));
    } else {
      cashNetAmount = cashGrossAmount;
    }
    const totalNetAmount = roundDisplayMoney(cashNetAmount + qrNetAmount);
    if (totalNetAmount > payableAmount + 0.009) {
      throw new BadRequestException(BRANCH_SPLIT_PAYMENT_ERRORS.INSTALLMENT_OVER);
    }
  }

  const totalNetAmount = roundDisplayMoney(cashNetAmount + qrNetAmount);
  const remainingAfterPayment = roundDisplayMoney(Math.max(payableAmount - totalNetAmount, 0));

  if (input.isFullPayment && Math.abs(totalNetAmount - payableAmount) > 0.009) {
    throw new BadRequestException(BRANCH_SPLIT_PAYMENT_ERRORS.FULL_PAYMENT_UNDER);
  }

  return {
    cashGrossAmount,
    qrGrossAmount,
    cashNetAmount,
    qrNetAmount,
    cashChangeAmount,
    totalEntered,
    totalNetAmount,
    remainingAfterPayment,
  };
}

export function splitPaymentIdempotencyKey(baseKey: string, method: 'CASH' | 'QR') {
  return `${baseKey}:${method}`;
}

export function hasSplitIdempotencyMarker(idempotencyKey?: string | null) {
  return Boolean(idempotencyKey?.includes(':CASH') || idempotencyKey?.includes(':QR'));
}
