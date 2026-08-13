import { BadRequestException } from '@nestjs/common';
import { FinanceAccountScope } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { isBranchAccountantUser } from '../rbac/rbac';
import { normalizeFinanceAccountName } from './finance-account-name.util';
import { roundMoney } from './finance-number.util';

export const BRANCH_ACCOUNTANT_CREATABLE_TYPES = ['BANK', 'QR'] as const;

export type BranchAccountantCreatableType = (typeof BRANCH_ACCOUNTANT_CREATABLE_TYPES)[number];

export const BRANCH_ACCOUNT_AUDIT = {
  BANK_CREATED: 'BRANCH_BANK_ACCOUNT_CREATED',
  QR_CREATED: 'BRANCH_QR_ACCOUNT_CREATED',
  ZERO_BALANCE_CREATED: 'BRANCH_ACCOUNT_CREATED_WITH_ZERO_BALANCE',
} as const;

export const ZERO_BALANCE_ACCOUNT_CREATED_MESSAGE =
  'Счет успешно создан с нулевым балансом.';

export type BranchAccountCreateInput = {
  typeCode: string;
  name: string;
  scope?: FinanceAccountScope;
  branchId?: string | null;
  currency?: string;
  openingBalance?: number | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  iban?: string | null;
  qrProvider?: string | null;
  qrMerchantId?: string | null;
  responsibleEmployeeId?: string | null;
};

export function isBranchAccountantCreatableType(
  typeCode: string,
): typeCode is BranchAccountantCreatableType {
  return (BRANCH_ACCOUNTANT_CREATABLE_TYPES as readonly string[]).includes(typeCode);
}

export function parseNonNegativeOpeningBalance(value: unknown): number {
  if (value == null || value === '') {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException('Начальный баланс должен быть корректным числом');
  }
  if (parsed < 0) {
    throw new BadRequestException('Начальный баланс не может быть отрицательным');
  }
  return roundMoney(parsed);
}

export function shouldPostOpeningBalanceLedger(amount: number) {
  return amount > 0;
}

export function assertBranchAccountantCanCreateAccount(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
  dto: BranchAccountCreateInput,
) {
  if (!isBranchAccountantUser(user)) {
    return;
  }
  if (!user.branchId) {
    throw new BadRequestException('Branch accountant must belong to a branch');
  }
  if (dto.scope && dto.scope !== FinanceAccountScope.BRANCH) {
    throw new BadRequestException('Branch accountant can only create branch-owned accounts');
  }
  if (dto.branchId && dto.branchId !== user.branchId) {
    throw new BadRequestException('Branch accountant cannot create accounts for another branch');
  }
  if (!isBranchAccountantCreatableType(dto.typeCode)) {
    throw new BadRequestException('Branch accountant can only create bank or QR accounts');
  }
}

export function validateBranchAccountTypeFields(dto: BranchAccountCreateInput) {
  const typeCode = dto.typeCode;
  if (typeCode === 'BANK') {
    if (!normalizeFinanceAccountName(dto.bankName)) {
      throw new BadRequestException('Укажите название банка');
    }
    if (!normalizeFinanceAccountName(dto.bankAccountNo)) {
      throw new BadRequestException('Укажите номер банковского счёта');
    }
    return;
  }

  if (typeCode === 'QR') {
    if (!normalizeFinanceAccountName(dto.qrProvider)) {
      throw new BadRequestException('Укажите QR-сервис или платёжного провайдера');
    }
  }
}

export function resolveBranchAccountCreateAuditAction(typeCode: string, openingBalance: number) {
  const actions = [
    typeCode === 'BANK'
      ? BRANCH_ACCOUNT_AUDIT.BANK_CREATED
      : typeCode === 'QR'
        ? BRANCH_ACCOUNT_AUDIT.QR_CREATED
        : 'finance.account.create',
  ];
  if (openingBalance <= 0) {
    actions.push(BRANCH_ACCOUNT_AUDIT.ZERO_BALANCE_CREATED);
  }
  return actions;
}

export function buildBranchAccountDuplicateWhere(
  branchId: string,
  dto: BranchAccountCreateInput,
): Array<{ message: string; where: Record<string, unknown> }> {
  const checks: Array<{ message: string; where: Record<string, unknown> }> = [
    {
      message: 'Счёт с таким названием и типом уже существует в филиале',
      where: {
        branchId,
        typeCode: dto.typeCode,
        name: { equals: normalizeFinanceAccountName(dto.name), mode: 'insensitive' },
        deletedAt: null,
      },
    },
  ];

  const bankAccountNo = normalizeFinanceAccountName(dto.bankAccountNo);
  if (dto.typeCode === 'BANK' && bankAccountNo) {
    checks.push({
      message: 'Банковский счёт с таким номером уже существует в филиале',
      where: {
        branchId,
        bankAccountNo,
        deletedAt: null,
      },
    });
  }

  const qrMerchantId = normalizeFinanceAccountName(dto.qrMerchantId);
  if (dto.typeCode === 'QR' && qrMerchantId) {
    checks.push({
      message: 'QR-счёт с таким идентификатором уже существует в филиале',
      where: {
        branchId,
        qrMerchantId,
        deletedAt: null,
      },
    });
  }

  return checks;
}
