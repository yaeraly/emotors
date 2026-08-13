import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, SalePaymentType, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { canAcceptSalePayment } from './branch-sales-workflow.util';
import { isBranchSalesManagerUser } from '../rbac/rbac';

export const FULL_PAYMENT_INSTALLMENT_WARNING =
  'Укажите условия рассрочки или полную оплату';

export const SALE_REGISTERED_SENT_TO_CASHIER_MESSAGE =
  'Продажа зарегистрирована. Счет отправлен кассиру для принятия оплаты.';

export const FULL_PAYMENT_UNDERPAYMENT_MESSAGE =
  'Для полной оплаты полученная сумма не может быть меньше общей суммы продажи.';

export const FULL_PAYMENT_INVALID_RECEIVED_AMOUNT_MESSAGE =
  'Укажите корректную сумму, полученную от клиента.';

export type FullPaymentChangeResult = {
  saleTotal: number;
  receivedAmount: number;
  changeAmount: number;
  isUnderpayment: boolean;
};

export function roundFullPaymentMoney(value: number) {
  return roundDisplayMoney(value);
}

export function computeFullPaymentChange(
  saleTotal: number,
  receivedAmount: number,
): FullPaymentChangeResult {
  const total = roundFullPaymentMoney(saleTotal);
  const received = roundFullPaymentMoney(receivedAmount);
  return {
    saleTotal: total,
    receivedAmount: received,
    changeAmount: roundFullPaymentMoney(Math.max(received - total, 0)),
    isUnderpayment: received + 0.009 < total,
  };
}

export function parseFullPaymentReceivedAmount(value: unknown) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return roundFullPaymentMoney(parsed);
}

export function assertFullPaymentReceivedAmount(
  saleTotal: number,
  receivedAmount: number,
) {
  const parsed = parseFullPaymentReceivedAmount(receivedAmount);
  if (parsed == null) {
    throw new BadRequestException(FULL_PAYMENT_INVALID_RECEIVED_AMOUNT_MESSAGE);
  }
  const result = computeFullPaymentChange(saleTotal, parsed);
  if (result.isUnderpayment) {
    throw new BadRequestException(FULL_PAYMENT_UNDERPAYMENT_MESSAGE);
  }
  return result;
}

export function shouldRegisterFullPaymentForCashier(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
  paymentType?: SalePaymentType | 'FULL_PAYMENT' | 'INSTALLMENT' | null,
) {
  if (!paymentType || paymentType === SalePaymentType.INSTALLMENT) {
    return false;
  }
  if (!isBranchSalesManagerUser(user)) {
    return false;
  }
  return !canAcceptSalePayment(user);
}

export function resolveSalePaymentType(
  paymentType?: SalePaymentType | 'FULL_PAYMENT' | 'INSTALLMENT' | null,
): SalePaymentType | null {
  if (!paymentType) return null;
  return paymentType as SalePaymentType;
}

export function isSaleWaitingForCashierPayment(status: SaleStatus | string) {
  return status === SaleStatus.WAITING_FOR_CASHIER_PAYMENT;
}

export function assertFullPaymentRegistrationAllowed(sale: {
  status: SaleStatus;
  paymentType?: SalePaymentType | null;
}) {
  if (
    sale.status === SaleStatus.FINALIZED ||
    sale.status === SaleStatus.CANCELLED
  ) {
    throw new BadRequestException('Sale is already completed or cancelled');
  }
  if (isSaleWaitingForCashierPayment(sale.status)) {
    return;
  }
  if (sale.status !== SaleStatus.DRAFT) {
    throw new BadRequestException('Sale cannot be registered for cashier payment');
  }
  if (sale.paymentType !== SalePaymentType.FULL_PAYMENT) {
    throw new BadRequestException('Only full-payment sales can be sent to cashier');
  }
}

export function buildExpectedPaymentState(totalAmount: number) {
  const roundedTotal = roundFullPaymentMoney(totalAmount);
  return {
    expectedPaymentAmount: roundedTotal,
    paidAmount: 0,
    debtAmount: roundedTotal,
    paymentStatus: PaymentStatus.WAITING_FOR_CASHIER,
  };
}

export function mapBranchPaymentMethodToSalePaymentMethod(
  method: string,
): 'CASH' | 'QR' | 'CARD' | 'BANK_TRANSFER' | 'MBANK' | 'ELCART' | 'BALANCE' {
  switch (method) {
    case 'CASH':
      return 'CASH';
    case 'QR':
      return 'QR';
    case 'CARD':
      return 'CARD';
    case 'BANK':
    case 'TRANSFER':
      return 'BANK_TRANSFER';
    case 'BALANCE':
      return 'BALANCE';
    case 'INSTALLMENT':
      return 'BANK_TRANSFER';
    default:
      return 'CASH';
  }
}
