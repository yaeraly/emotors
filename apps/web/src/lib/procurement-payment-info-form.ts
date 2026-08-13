export type PaymentInfoMethod = 'BANK_ACCOUNT' | 'QR_CODE';

export type SupplierAccountFormValue = {
  paymentMethod: PaymentInfoMethod;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

export const EMPTY_SUPPLIER_ACCOUNT_FORM: SupplierAccountFormValue = {
  paymentMethod: 'BANK_ACCOUNT',
  bankName: '',
  accountHolder: '',
  accountNumber: '',
};

/** Always a defined string for controlled inputs — never undefined/null. */
export function controlledString(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function coercePaymentInfoMethod(value: unknown): PaymentInfoMethod {
  return value === 'QR_CODE' ? 'QR_CODE' : 'BANK_ACCOUNT';
}

/**
 * Normalize any partial / nullable API or form payload into a fully controlled
 * supplier-account form. Every string field is always `''` or a real string.
 */
export function normalizeSupplierAccountForm(
  next: Partial<SupplierAccountFormValue> | null | undefined,
  previous: SupplierAccountFormValue = EMPTY_SUPPLIER_ACCOUNT_FORM,
): SupplierAccountFormValue {
  const methodSource =
    next && 'paymentMethod' in next && next.paymentMethod != null
      ? next.paymentMethod
      : previous.paymentMethod;

  return {
    paymentMethod: coercePaymentInfoMethod(methodSource),
    bankName:
      next && 'bankName' in next ? controlledString(next.bankName) : controlledString(previous.bankName),
    accountHolder:
      next && 'accountHolder' in next
        ? controlledString(next.accountHolder)
        : controlledString(previous.accountHolder),
    accountNumber:
      next && 'accountNumber' in next
        ? controlledString(next.accountNumber)
        : controlledString(previous.accountNumber),
  };
}

/**
 * When the payment method changes, keep only fields valid for the selected method.
 * Fields that do not belong are reset to empty strings (never undefined/null).
 */
export function formForPaymentMethod(
  previous: SupplierAccountFormValue,
  nextMethod: PaymentInfoMethod,
): SupplierAccountFormValue {
  if (nextMethod === 'QR_CODE') {
    return {
      paymentMethod: 'QR_CODE',
      bankName: '',
      accountHolder: '',
      accountNumber: '',
    };
  }
  return {
    paymentMethod: 'BANK_ACCOUNT',
    bankName: controlledString(previous.bankName),
    accountHolder: controlledString(previous.accountHolder),
    accountNumber: controlledString(previous.accountNumber),
  };
}

/** Map nullable API payment-info payload into controlled form strings. */
export function formFromPaymentInfoApi(
  data: {
    paymentMethod?: unknown;
    bankName?: string | null;
    accountHolder?: string | null;
    accountNumber?: string | null;
  } | null | undefined,
  previous: SupplierAccountFormValue = EMPTY_SUPPLIER_ACCOUNT_FORM,
): SupplierAccountFormValue {
  if (!data) return normalizeSupplierAccountForm(previous);
  return normalizeSupplierAccountForm(
    {
      paymentMethod: coercePaymentInfoMethod(data.paymentMethod),
      bankName: controlledString(data.bankName),
      accountHolder: controlledString(data.accountHolder),
      accountNumber: controlledString(data.accountNumber),
    },
    previous,
  );
}
