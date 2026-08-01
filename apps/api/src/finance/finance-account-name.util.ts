import { BadRequestException } from '@nestjs/common';

/** Display name length for FinanceAccount.name (internal identification). */
export const FINANCE_ACCOUNT_NAME_MAX_LENGTH = 120;

export const BANK_ACCOUNT_NAME_UPDATED = 'BANK_ACCOUNT_NAME_UPDATED';

export function normalizeFinanceAccountName(raw: string | null | undefined): string {
  return String(raw ?? '').trim();
}

export function assertValidFinanceAccountName(raw: string | null | undefined): string {
  const name = normalizeFinanceAccountName(raw);
  if (!name) {
    throw new BadRequestException('Account name is required');
  }
  if (name.length > FINANCE_ACCOUNT_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `Account name must be at most ${FINANCE_ACCOUNT_NAME_MAX_LENGTH} characters`,
    );
  }
  return name;
}

export function branchAccountantAttemptedNonNameEdit(dto: {
  bankName?: string;
  bankAccountNo?: string;
  iban?: string;
  responsibleEmployeeId?: string;
  qrProvider?: string;
  qrMerchantId?: string;
  posTerminalId?: string;
  notes?: string;
}): boolean {
  return (
    dto.bankName !== undefined ||
    dto.bankAccountNo !== undefined ||
    dto.iban !== undefined ||
    dto.responsibleEmployeeId !== undefined ||
    dto.qrProvider !== undefined ||
    dto.qrMerchantId !== undefined ||
    dto.posTerminalId !== undefined ||
    dto.notes !== undefined
  );
}
