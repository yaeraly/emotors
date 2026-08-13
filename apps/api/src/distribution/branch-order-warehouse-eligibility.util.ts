import {
  BranchDistributionOrderStatus,
  BranchOrderInstallmentStatus,
} from '@prisma/client';

export type WarehouseEligibilityInstallment = {
  status: BranchOrderInstallmentStatus | string;
  firstPaymentRequired?: boolean;
  firstPaymentConfirmed?: boolean;
  firstPaymentAmount?: number | { toNumber?: () => number } | null;
} | null | undefined;

export type WarehouseEligibilityOrder = {
  status: BranchDistributionOrderStatus | string;
};

/**
 * HQ Warehouse may fulfill when:
 * - full payment confirmed (order PAID), OR
 * - HQ CEO approved the installment (including zero initial payment).
 */
export function isBranchOrderEligibleForHqWarehouse(
  order: WarehouseEligibilityOrder,
  installment?: WarehouseEligibilityInstallment,
): boolean {
  if (order.status === BranchDistributionOrderStatus.PAID || order.status === 'PAID') {
    return true;
  }
  if (!installment) return false;
  if (
    installment.status === BranchOrderInstallmentStatus.PENDING ||
    installment.status === 'PENDING' ||
    installment.status === BranchOrderInstallmentStatus.REJECTED ||
    installment.status === 'REJECTED' ||
    installment.status === BranchOrderInstallmentStatus.CANCELLED ||
    installment.status === 'CANCELLED'
  ) {
    return false;
  }
  return (
    installment.status === BranchOrderInstallmentStatus.APPROVED ||
    installment.status === 'APPROVED'
  );
}

export function isZeroInitialApprovedInstallment(installment?: WarehouseEligibilityInstallment) {
  if (!installment) return false;
  if (
    installment.status !== BranchOrderInstallmentStatus.APPROVED &&
    installment.status !== 'APPROVED'
  ) {
    return false;
  }
  if (installment.firstPaymentRequired === false) return true;
  const amount =
    typeof installment.firstPaymentAmount === 'number'
      ? installment.firstPaymentAmount
      : Number(installment.firstPaymentAmount ?? 0);
  return !Number.isFinite(amount) || amount <= 0.009;
}

export function canStartHqWarehouseFulfillment(
  order: WarehouseEligibilityOrder,
  installment?: WarehouseEligibilityInstallment,
): { allowed: boolean; reason?: string } {
  if (
    order.status === BranchDistributionOrderStatus.SENT_TO_WAREHOUSE ||
    order.status === 'SENT_TO_WAREHOUSE' ||
    order.status === BranchDistributionOrderStatus.PICKING ||
    order.status === 'PICKING' ||
    order.status === BranchDistributionOrderStatus.PACKED ||
    order.status === 'PACKED' ||
    order.status === BranchDistributionOrderStatus.SHIPPED ||
    order.status === 'SHIPPED'
  ) {
    return { allowed: true };
  }

  if (installment?.status === BranchOrderInstallmentStatus.PENDING || installment?.status === 'PENDING') {
    return { allowed: false, reason: 'INSTALLMENT_PENDING' };
  }
  if (installment?.status === BranchOrderInstallmentStatus.REJECTED || installment?.status === 'REJECTED') {
    return { allowed: false, reason: 'INSTALLMENT_REJECTED' };
  }

  if (!isBranchOrderEligibleForHqWarehouse(order, installment)) {
    return { allowed: false, reason: 'NOT_FINANCIALLY_CLEARED' };
  }
  return { allowed: true };
}
