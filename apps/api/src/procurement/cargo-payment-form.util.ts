import { TransportExpenseType, ProcurementPaymentInfoMethod, FileAttachmentEntityType } from '@prisma/client';

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

export function shouldRepairCargoPaymentMethod(input: {
  expenseType: string;
  paymentMethod?: string | null;
  qrAttachmentCount: number;
}): boolean {
  return (
    isCargoPaymentExpenseType(input.expenseType) &&
    input.qrAttachmentCount > 0 &&
    input.paymentMethod !== ProcurementPaymentInfoMethod.QR_CODE
  );
}

/** Recipient payment method for cargo; QR attachments override stale BANK_ACCOUNT storage. */
export function resolveCargoRecipientPaymentMethod(input: {
  expenseType: string;
  paymentMethod?: string | null;
  qrAttachmentCount?: number;
}): ProcurementPaymentInfoMethod {
  if (
    shouldRepairCargoPaymentMethod({
      expenseType: input.expenseType,
      paymentMethod: input.paymentMethod,
      qrAttachmentCount: input.qrAttachmentCount ?? 0,
    })
  ) {
    return ProcurementPaymentInfoMethod.QR_CODE;
  }
  return resolveCargoPaymentMethod(input.expenseType, input.paymentMethod);
}

export const CARGO_PAYMENT_QR_ATTACHMENT_TYPE = FileAttachmentEntityType.PAYMENT_QR;

export function stripCargoBankRequisites<T extends Record<string, unknown>>(data: T): T {
  return {
    ...data,
    paymentMethod: ProcurementPaymentInfoMethod.QR_CODE,
    bankName: null,
    accountHolder: null,
    accountNumber: null,
  };
}
