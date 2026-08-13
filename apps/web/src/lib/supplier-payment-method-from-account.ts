export type DerivedSupplierPaymentMethod =
  | 'CASH'
  | 'BANK_ACCOUNT'
  | 'QR_CODE'
  | 'BANK_CARD';

/**
 * Display/client helper mirroring backend account-type → payment-method mapping.
 * Backend remains authoritative — this is for read-only UI only.
 */
export function deriveSupplierPaymentMethodFromAccountType(
  typeCode: string | null | undefined,
): DerivedSupplierPaymentMethod | null {
  const code = String(typeCode || '')
    .trim()
    .toUpperCase();

  switch (code) {
    case 'CASH':
    case 'CASHBOX':
    case 'PETTY_CASH':
      return 'CASH';
    case 'BANK':
    case 'BANK_ACCOUNT':
    case 'DEPOSIT':
      return 'BANK_ACCOUNT';
    case 'QR':
    case 'QR_ACCOUNT':
      return 'QR_CODE';
    case 'CARD':
    case 'POS':
    case 'ACQUIRING_ACCOUNT':
      return 'BANK_CARD';
    default:
      return null;
  }
}

export function derivedSupplierPaymentMethodLabelKey(
  method: DerivedSupplierPaymentMethod | null,
): string {
  if (!method) return 'finance.billsToPay.methodFromAccount.none';
  return `finance.billsToPay.methodFromAccount.${method}`;
}
