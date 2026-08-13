import { BadRequestException } from '@nestjs/common';
import { BranchPaymentMethod, Prisma } from '@prisma/client';
import { isMoneyEqual, subtractMoney, toStoredMoneyKgs } from '../common/money/money';

type MoneyInput = number | string | Prisma.Decimal | null | undefined;

export const BRANCH_CUSTOMER_PAYMENT_AUDIT = {
  PAYMENT_CONFIRMED: 'BRANCH_CUSTOMER_PAYMENT_CONFIRMED',
  ACCOUNT_TRANSACTION_CREATED: 'BRANCH_ACCOUNT_TRANSACTION_CREATED',
  ACCOUNT_BALANCE_INCREASED: 'BRANCH_ACCOUNT_BALANCE_INCREASED',
  MISSING_POSTING_REPAIRED: 'MISSING_BRANCH_PAYMENT_POSTING_REPAIRED',
} as const;

export const BRANCH_PAYMENT_POSTING_REQUIRED_MESSAGE =
  'Невозможно закрыть счёт без зачисления средств на счёт филиала.';

export const CASH_PAYMENT_ACCOUNT_TYPES = ['CASH', 'PETTY_CASH'] as const;
export const QR_PAYMENT_ACCOUNT_TYPES = ['QR'] as const;
export const BANK_PAYMENT_ACCOUNT_TYPES = ['BANK', 'DEPOSIT'] as const;

export function resolveAllowedAccountTypeCodes(
  method: BranchPaymentMethod | string,
): readonly string[] {
  switch (method) {
    case 'CASH':
      return CASH_PAYMENT_ACCOUNT_TYPES;
    case 'QR':
      return QR_PAYMENT_ACCOUNT_TYPES;
    case 'BANK':
    case 'TRANSFER':
      return BANK_PAYMENT_ACCOUNT_TYPES;
    default:
      return [];
  }
}

export function assertPaymentMethodMatchesAccountType(
  method: BranchPaymentMethod | string,
  accountTypeCode: string,
) {
  const allowed = resolveAllowedAccountTypeCodes(method);
  if (!allowed.length || !allowed.includes(accountTypeCode)) {
    if (method === 'CASH') {
      throw new BadRequestException('Для оплаты наличными выберите кассу филиала.');
    }
    if (method === 'QR') {
      throw new BadRequestException('Для QR-оплаты выберите активный QR-счет филиала.');
    }
    if (method === 'BANK' || method === 'TRANSFER') {
      throw new BadRequestException('Для банковского перевода выберите банковский счёт филиала.');
    }
    throw new BadRequestException('Выбранный счёт не соответствует способу оплаты');
  }
}

export function resolveBranchPaymentNetAmount(input: {
  amount?: MoneyInput;
  netAcceptedAmount?: MoneyInput;
  receivedAmount?: MoneyInput;
  changeAmount?: MoneyInput;
}) {
  if (input.netAcceptedAmount != null) {
    return toStoredMoneyKgs(input.netAcceptedAmount);
  }
  if (input.receivedAmount != null && input.changeAmount != null) {
    return toStoredMoneyKgs(subtractMoney(input.receivedAmount, input.changeAmount));
  }
  return toStoredMoneyKgs(input.amount ?? 0);
}

export function paymentRequiresLedgerPosting(input: {
  confirmationStatus: string;
  netAcceptedAmount: number;
}) {
  return input.confirmationStatus === 'CONFIRMED' && input.netAcceptedAmount > 0;
}

export function reconcileConfirmedPaymentPosting(input: {
  netAcceptedAmount: number;
  ledgerSignedAmount?: number | null;
  balanceDelta?: number | null;
}) {
  const expected = toStoredMoneyKgs(input.netAcceptedAmount ?? 0);
  const ledger = toStoredMoneyKgs(input.ledgerSignedAmount ?? 0);
  const delta = toStoredMoneyKgs(input.balanceDelta ?? 0);
  return {
    expected,
    ledger,
    balanceDelta: delta,
    difference: toStoredMoneyKgs(subtractMoney(expected, ledger)),
    matches: isMoneyEqual(expected, ledger) && isMoneyEqual(expected, delta),
  };
}
