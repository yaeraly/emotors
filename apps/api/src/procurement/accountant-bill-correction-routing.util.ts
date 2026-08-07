import { TransportExpenseStatus } from '@prisma/client';
import type { AccountantBillRequestType } from './accountant-bills.util';

export const ACCOUNTANT_BILL_CORRECTION_ROUTING_TYPES = new Set<AccountantBillRequestType>([
  'SUPPLIER_PAYMENT',
  'CHINA_DOMESTIC_TRANSPORT',
  'CARGO_PAYMENT',
  'KYRGYZSTAN_DOMESTIC_TRANSPORT',
]);

export const EXECUTION_RETURNED_TO_ACCOUNTANT = 'RETURNED_TO_ACCOUNTANT';

export type CorrectionRoutingUser = {
  id?: string | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
};

export type AccountantBillCorrectionRouting = {
  direction: 'FROM_HQ_CASHIER' | 'TO_SUPPLY_MANAGER';
  employeeName?: string;
  employeeLogin?: string;
};

export function resolveCorrectionRoutingEmployee(
  user?: CorrectionRoutingUser | null,
): Pick<AccountantBillCorrectionRouting, 'employeeName' | 'employeeLogin'> {
  if (!user?.id) {
    return {};
  }
  const fullName = String(user.fullName ?? '').trim();
  const username = String(user.username ?? '').trim();
  const email = String(user.email ?? '').trim();
  return {
    ...(fullName ? { employeeName: fullName } : {}),
    ...(username || email ? { employeeLogin: username || email } : {}),
  };
}

export function resolveTransportExpenseCorrectionRouting(input: {
  requestType: AccountantBillRequestType;
  status: string;
  executionStatus?: string | null;
  returnedBy?: CorrectionRoutingUser | null;
  supplyManager?: CorrectionRoutingUser | null;
}): AccountantBillCorrectionRouting | undefined {
  if (!ACCOUNTANT_BILL_CORRECTION_ROUTING_TYPES.has(input.requestType)) {
    return undefined;
  }
  if (input.status !== TransportExpenseStatus.RETURNED) {
    return undefined;
  }
  if (input.executionStatus === EXECUTION_RETURNED_TO_ACCOUNTANT) {
    return {
      direction: 'FROM_HQ_CASHIER',
      ...resolveCorrectionRoutingEmployee(input.returnedBy),
    };
  }
  if (!input.executionStatus) {
    return {
      direction: 'TO_SUPPLY_MANAGER',
      ...resolveCorrectionRoutingEmployee(input.supplyManager),
    };
  }
  return undefined;
}

export function resolveSupplierInvoiceCorrectionRouting(input: {
  invoiceReviewStatus?: string | null;
  invoiceSentBy?: CorrectionRoutingUser | null;
  supplierPayments?: Array<{
    status?: string | null;
    executionStatus?: string | null;
    returnedAt?: Date | string | null;
    sequenceNumber?: number | null;
    returnedBy?: CorrectionRoutingUser | null;
  }>;
}): AccountantBillCorrectionRouting | undefined {
  const review = String(input.invoiceReviewStatus ?? '').toUpperCase();
  if (review === 'RETURNED') {
    return {
      direction: 'TO_SUPPLY_MANAGER',
      ...resolveCorrectionRoutingEmployee(input.invoiceSentBy),
    };
  }

  const cashierReturns = (input.supplierPayments ?? [])
    .filter(
      (payment) =>
        String(payment.status ?? '').toUpperCase() === 'RETURNED' &&
        payment.executionStatus === EXECUTION_RETURNED_TO_ACCOUNTANT,
    )
    .sort((a, b) => {
      const aTime = a.returnedAt ? new Date(a.returnedAt).getTime() : 0;
      const bTime = b.returnedAt ? new Date(b.returnedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return Number(b.sequenceNumber ?? 0) - Number(a.sequenceNumber ?? 0);
    });

  const latestCashierReturn = cashierReturns[0];
  if (!latestCashierReturn) {
    return undefined;
  }

  return {
    direction: 'FROM_HQ_CASHIER',
    ...resolveCorrectionRoutingEmployee(latestCashierReturn.returnedBy),
  };
}

export function formatCorrectionRoutingAssignee(
  routing: AccountantBillCorrectionRouting,
  roleLabel: string,
): string {
  const identity = routing.employeeName?.trim() || routing.employeeLogin?.trim();
  return identity ? `${roleLabel} — ${identity}` : roleLabel;
}
