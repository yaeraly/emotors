import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, SaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { hasCashierCapability } from '../rbac/cashier-capability.util';
import {
  hasAnyFullAccessRole,
  isBranchOwnerUser,
  isBranchSalesManagerUser,
  resolveUserRoles,
} from '../rbac/rbac';

export type SaleCancellationContext = {
  status: SaleStatus;
  paidAmount: number;
  paymentStatus: PaymentStatus;
};

const BRANCH_SALES_MANAGER_CANCELLABLE_STATUSES: SaleStatus[] = [
  SaleStatus.DRAFT,
  SaleStatus.SENT_TO_CUSTOMER,
  SaleStatus.APPROVED_BY_CUSTOMER,
];

export function canAcceptSalePayment(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  if (hasAnyFullAccessRole(resolveUserRoles(user))) {
    return true;
  }
  if (isBranchOwnerUser(user)) {
    return true;
  }
  return hasCashierCapability(user);
}

export function shouldSyncSalePaymentsOnDraftSave(input: {
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>;
  paymentType?: 'FULL_PAYMENT' | 'INSTALLMENT';
}) {
  if (input.paymentType === 'INSTALLMENT') {
    return false;
  }
  return canAcceptSalePayment(input.user);
}

export function isSaleCancellableByBranchSalesManager(sale: SaleCancellationContext) {
  if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.FINALIZED) {
    return false;
  }
  if (sale.paidAmount > 0.009) {
    return false;
  }
  if (sale.paymentStatus === PaymentStatus.PAID || sale.paymentStatus === PaymentStatus.PARTIAL) {
    return false;
  }
  return BRANCH_SALES_MANAGER_CANCELLABLE_STATUSES.includes(sale.status);
}

export function assertBranchSalesManagerCanCancelSale(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
  sale: SaleCancellationContext,
) {
  if (!isBranchSalesManagerUser(user)) {
    return;
  }
  if (isSaleCancellableByBranchSalesManager(sale)) {
    return;
  }
  throw new BadRequestException('Продажу нельзя отменить на текущем этапе.');
}
