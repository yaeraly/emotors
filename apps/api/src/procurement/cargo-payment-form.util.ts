import { TransportExpenseType, ProcurementPaymentInfoMethod } from '@prisma/client';

export function isCargoPaymentExpenseType(expenseType: string): boolean {
  return expenseType === TransportExpenseType.INTERNATIONAL_FREIGHT;
}

/** Cargo payments always use QR requisites, never bank account fields. */
export function resolveCargoPaymentMethod(
  expenseType: string,
  requested?: ProcurementPaymentInfoMethod | string | null,
): ProcurementPaymentInfoMethod {
  if (isCargoPaymentExpenseType(expenseType)) {
    return ProcurementPaymentInfoMethod.QR_CODE;
  }
  return (requested as ProcurementPaymentInfoMethod) ?? ProcurementPaymentInfoMethod.QR_CODE;
}

export function stripCargoBankRequisites<T extends Record<string, unknown>>(data: T): T {
  return {
    ...data,
    paymentMethod: ProcurementPaymentInfoMethod.QR_CODE,
    bankName: null,
    accountHolder: null,
    accountNumber: null,
  };
}
