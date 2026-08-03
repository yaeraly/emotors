import type { PaymentPartRow } from './sale-payment-parts';
import { createPaymentPartRow } from './sale-payment-parts';
import type { User } from './types';
import { canAcceptSalePayment, isBranchSalesManagerUser } from './rbac';

export function formatFullPaymentAmount(totalAmount: number) {
  const rounded = Math.round((totalAmount + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function buildFullPaymentRows(
  totalAmount: number,
  method: PaymentPartRow['method'] = 'CASH',
): PaymentPartRow[] {
  const amount = formatFullPaymentAmount(totalAmount);
  return [
    createPaymentPartRow({
      method,
      amount,
      cashReceived: method === 'CASH' ? amount : '',
    }),
  ];
}

export function shouldUseBranchCashierFullPaymentFlow(
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined,
) {
  if (!user) return false;
  return isBranchSalesManagerUser(user) && !canAcceptSalePayment(user);
}

export function canFinalizeFullPaymentSale(input: {
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined;
  paymentType: 'FULL_PAYMENT' | 'INSTALLMENT';
  totalAmount: number;
  hasBlockingPriceError: boolean;
  hasMissingPricing: boolean;
  paymentValidationOk: boolean;
  paymentComplete: boolean;
}) {
  if (input.paymentType !== 'FULL_PAYMENT') return false;
  if (input.totalAmount <= 0 || input.hasBlockingPriceError || input.hasMissingPricing) {
    return false;
  }
  if (shouldUseBranchCashierFullPaymentFlow(input.user)) {
    return true;
  }
  return input.paymentValidationOk && input.paymentComplete;
}
