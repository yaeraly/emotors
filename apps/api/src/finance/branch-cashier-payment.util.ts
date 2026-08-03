import { BadRequestException } from '@nestjs/common';
import { BranchPaymentMethod } from '@prisma/client';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { computeFullPaymentChange } from '../sales/sale-full-payment.util';

export const INVOICE_ALREADY_PAID_MESSAGE = 'Этот счет уже оплачен.';

export const BRANCH_CASHIER_PAYMENT_AUDIT = {
  PAYMENT_ACCEPTED: 'BRANCH_CASHIER_PAYMENT_ACCEPTED',
  ACCOUNT_BALANCE_INCREASED: 'BRANCH_ACCOUNT_BALANCE_INCREASED',
  INVOICE_PARTIALLY_PAID: 'BRANCH_INVOICE_PARTIALLY_PAID',
  INVOICE_CLOSED: 'BRANCH_INVOICE_CLOSED',
} as const;

export type BranchCashierNetPaymentInput = {
  remainingDebt: number;
  isFullPayment: boolean;
  amount?: number;
  receivedAmount?: number | null;
  changeAmount?: number | null;
};

export type BranchCashierNetPaymentResult = {
  netAcceptedAmount: number;
  receivedAmount: number | null;
  changeAmount: number | null;
};

export function roundCashierMoney(value: number) {
  return roundDisplayMoney(value);
}

export function resolveBranchCashierNetPayment(
  input: BranchCashierNetPaymentInput,
): BranchCashierNetPaymentResult {
  const remaining = roundCashierMoney(input.remainingDebt);
  if (remaining <= 0) {
    throw new BadRequestException(INVOICE_ALREADY_PAID_MESSAGE);
  }

  if (input.isFullPayment) {
    const received =
      input.receivedAmount != null
        ? roundCashierMoney(input.receivedAmount)
        : input.amount != null
          ? roundCashierMoney(input.amount)
          : remaining;
    const change =
      input.changeAmount != null
        ? roundCashierMoney(input.changeAmount)
        : computeFullPaymentChange(remaining, received).changeAmount;
    const netAcceptedAmount = remaining;

    if (received + 0.009 < remaining) {
      throw new BadRequestException(
        'Для полной оплаты полученная сумма не может быть меньше остатка по счёту.',
      );
    }
    if (change > received + 0.009) {
      throw new BadRequestException('Сдача не может превышать полученную сумму.');
    }
    if (roundCashierMoney(received - change) + 0.009 < remaining) {
      throw new BadRequestException('Сумма зачисления не покрывает остаток по счёту.');
    }

    return {
      netAcceptedAmount,
      receivedAmount: received,
      changeAmount: change,
    };
  }

  const netAcceptedAmount = roundCashierMoney(input.amount ?? 0);
  if (netAcceptedAmount <= 0) {
    throw new BadRequestException('Сумма платежа должна быть больше нуля');
  }
  if (netAcceptedAmount > remaining + 0.009) {
    throw new BadRequestException(`Максимальная сумма платежа: ${remaining.toFixed(2)}.`);
  }

  const received =
    input.receivedAmount != null ? roundCashierMoney(input.receivedAmount) : netAcceptedAmount;
  const change =
    input.changeAmount != null
      ? roundCashierMoney(input.changeAmount)
      : roundCashierMoney(Math.max(received - netAcceptedAmount, 0));

  if (roundCashierMoney(received - change) + 0.009 < netAcceptedAmount) {
    throw new BadRequestException('Сумма зачисления не совпадает с принятой оплатой за вычетом сдачи.');
  }

  return {
    netAcceptedAmount,
    receivedAmount: received,
    changeAmount: change > 0.009 ? change : null,
  };
}

export function reconcilePaymentAccountDelta(input: {
  netAcceptedAmount: number;
  beforeBalance: number;
  afterBalance: number;
}) {
  const delta = roundCashierMoney(input.afterBalance - input.beforeBalance);
  const expected = roundCashierMoney(input.netAcceptedAmount);
  return {
    delta,
    expected,
    matches: Math.abs(delta - expected) < 0.01,
    difference: roundCashierMoney(delta - expected),
  };
}

export function mapBranchPaymentMethodLabel(method: BranchPaymentMethod) {
  switch (method) {
    case 'CASH':
      return 'cash';
    case 'QR':
      return 'card';
    case 'BANK':
    case 'TRANSFER':
      return 'bank transfer';
    case 'BALANCE':
      return 'balance';
    default:
      return method.toLowerCase();
  }
}
