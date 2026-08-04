import type { BranchPaymentMethod } from '@/lib/types';

export type BranchCashierReceivingAccountResolution =
  | {
      status: 'resolved';
      account: {
        id: string;
        name: string;
        accountNumber: string;
        typeCode: string;
        currentBalance: number;
        availableBalance?: number;
      };
      resolution: 'primary_assignment' | 'branch_default' | 'single_eligible';
    }
  | {
      status: 'missing' | 'ambiguous';
      errorCode: 'NO_CASH' | 'NO_QR' | 'NO_BANK' | 'NO_DEFAULT_MULTIPLE';
      message: string;
    };

export const BRANCH_CASHIER_INSTALLMENT_PAYMENT_METHODS: BranchPaymentMethod[] = [
  'CASH',
  'QR',
  'BANK',
];

export const BRANCH_CASHIER_INVOICE_PAYMENT_METHODS: BranchPaymentMethod[] = [
  'CASH',
  'QR',
  'BANK',
];

export function branchCashierPaymentMethodLabelKey(method: BranchPaymentMethod): string {
  switch (method) {
    case 'CASH':
      return 'sales.paymentMethods.CASH';
    case 'QR':
      return 'sales.paymentMethods.QR';
    case 'BANK':
    case 'TRANSFER':
      return 'sales.paymentMethods.BANK_TRANSFER';
    default:
      return `sales.paymentMethods.${method}`;
  }
}

export function buildReceivingAccountResolveQuery(
  paymentMethod: BranchPaymentMethod,
  contextId?: string,
  options?: { invoiceId?: string },
) {
  const params = new URLSearchParams();
  params.set('paymentMethod', paymentMethod);
  if (options?.invoiceId) {
    params.set('invoiceId', options.invoiceId);
  } else if (contextId) {
    params.set('installmentId', contextId);
  }
  return `?${params.toString()}`;
}

export function formatBranchCashierAccountLabel(account: { name: string }) {
  return account.name.trim();
}

export function filterBranchCashierTransferDestinationAccounts<T extends { id: string }>(
  accounts: T[],
  sourceAccountId: string,
) {
  if (!sourceAccountId) return accounts;
  return accounts.filter((account) => account.id !== sourceAccountId);
}

export function resolveBranchCashierTransferDestinationId(
  currentDestinationAccountId: string,
  nextSourceAccountId: string,
) {
  return currentDestinationAccountId === nextSourceAccountId ? '' : currentDestinationAccountId;
}
