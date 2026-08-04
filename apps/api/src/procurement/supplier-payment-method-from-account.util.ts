import { BadRequestException } from '@nestjs/common';
import { ProcurementSupplierPaymentMethod } from '@prisma/client';

/**
 * Map HQ FinanceAccount.typeCode → ProcurementSupplierPaymentMethod.
 * Authoritative for accountant partial supplier payments.
 */
export function resolveSupplierPaymentMethodFromAccountType(
  typeCode: string | null | undefined,
): ProcurementSupplierPaymentMethod {
  const code = String(typeCode || '')
    .trim()
    .toUpperCase();

  switch (code) {
    case 'CASH':
    case 'CASHBOX':
    case 'PETTY_CASH':
      return ProcurementSupplierPaymentMethod.CASH;
    case 'BANK':
    case 'BANK_ACCOUNT':
    case 'DEPOSIT':
      return ProcurementSupplierPaymentMethod.BANK_ACCOUNT;
    case 'QR':
    case 'QR_ACCOUNT':
      return ProcurementSupplierPaymentMethod.QR_CODE;
    case 'CARD':
    case 'POS':
    case 'ACQUIRING_ACCOUNT':
      return ProcurementSupplierPaymentMethod.BANK_CARD;
    default:
      throw new BadRequestException(
        'Не удалось определить способ оплаты для выбранного счёта.',
      );
  }
}

export function tryResolveSupplierPaymentMethodFromAccountType(
  typeCode: string | null | undefined,
): ProcurementSupplierPaymentMethod | null {
  try {
    return resolveSupplierPaymentMethodFromAccountType(typeCode);
  } catch {
    return null;
  }
}
