import { BadRequestException } from '@nestjs/common';
import { resolveAllowedAccountTypeCodes } from './branch-payment-posting.util';

export const BRANCH_CASHIER_RECEIVING_ACCOUNT_AUDIT = {
  PAYMENT_METHOD_SELECTED: 'INSTALLMENT_PAYMENT_METHOD_SELECTED',
  RECEIVING_ACCOUNT_AUTO_RESOLVED: 'INSTALLMENT_RECEIVING_ACCOUNT_AUTO_RESOLVED',
} as const;

export const BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS = {
  NO_DEFAULT_MULTIPLE:
    'Для этого способа оплаты не настроен счет по умолчанию. Обратитесь к бухгалтеру.',
  NO_CASH: 'Для наличной оплаты не настроена активная касса филиала.',
  NO_QR: 'Для QR-оплаты не настроен активный QR-счет филиала.',
  NO_BANK: 'Для банковского перевода не настроен активный банковский счет филиала.',
} as const;

export type BranchCashierReceivingAccountCandidate = {
  id: string;
  name: string;
  accountNumber: string;
  typeCode: string;
  currentBalance: number;
  availableBalance?: number;
  isPrimaryAssignment?: boolean;
};

export type BranchCashierReceivingAccountResolution =
  | {
      status: 'resolved';
      account: BranchCashierReceivingAccountCandidate;
      resolution: 'primary_assignment' | 'branch_default' | 'single_eligible';
    }
  | {
      status: 'missing';
      errorCode: 'NO_CASH' | 'NO_QR' | 'NO_BANK';
      message: string;
    }
  | {
      status: 'ambiguous';
      errorCode: 'NO_DEFAULT_MULTIPLE';
      message: string;
    };

export function missingReceivingAccountErrorCode(
  paymentMethod: string,
): 'NO_CASH' | 'NO_QR' | 'NO_BANK' {
  switch (paymentMethod) {
    case 'CASH':
      return 'NO_CASH';
    case 'QR':
      return 'NO_QR';
    case 'BANK':
    case 'TRANSFER':
      return 'NO_BANK';
    default:
      return 'NO_BANK';
  }
}

export function missingReceivingAccountMessage(
  paymentMethod: string,
): string {
  const code = missingReceivingAccountErrorCode(paymentMethod);
  return BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS[code];
}

export function resolveBranchCashierReceivingAccount(input: {
  paymentMethod: string;
  eligibleAccounts: BranchCashierReceivingAccountCandidate[];
  branchDefaultAccountId?: string | null;
}): BranchCashierReceivingAccountResolution {
  const eligible = [...input.eligibleAccounts];
  if (!eligible.length) {
    const errorCode = missingReceivingAccountErrorCode(input.paymentMethod);
    return {
      status: 'missing',
      errorCode,
      message: BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS[errorCode],
    };
  }

  if (eligible.length === 1) {
    return {
      status: 'resolved',
      account: eligible[0],
      resolution: 'single_eligible',
    };
  }

  const primaryMatches = eligible.filter((account) => account.isPrimaryAssignment);
  if (primaryMatches.length === 1) {
    return {
      status: 'resolved',
      account: primaryMatches[0],
      resolution: 'primary_assignment',
    };
  }
  if (primaryMatches.length > 1) {
    return {
      status: 'ambiguous',
      errorCode: 'NO_DEFAULT_MULTIPLE',
      message: BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS.NO_DEFAULT_MULTIPLE,
    };
  }

  if (input.branchDefaultAccountId) {
    const branchDefault = eligible.find((account) => account.id === input.branchDefaultAccountId);
    if (branchDefault) {
      return {
        status: 'resolved',
        account: branchDefault,
        resolution: 'branch_default',
      };
    }
  }

  return {
    status: 'ambiguous',
    errorCode: 'NO_DEFAULT_MULTIPLE',
    message: BRANCH_CASHIER_RECEIVING_ACCOUNT_ERRORS.NO_DEFAULT_MULTIPLE,
  };
}

export function assertResolvedReceivingAccountMatchesClient(
  resolvedAccountId: string,
  clientAccountId?: string | null,
) {
  if (!clientAccountId?.trim()) return;
  if (clientAccountId.trim() !== resolvedAccountId) {
    throw new BadRequestException(
      'Выбранный счёт не соответствует способу оплаты. Обновите страницу и повторите попытку.',
    );
  }
}

export function paymentMethodAllowsAccountType(paymentMethod: string, typeCode: string) {
  return resolveAllowedAccountTypeCodes(paymentMethod).includes(typeCode);
}
