import {
  BranchDistributionOrderStatus,
  BranchOrderInstallmentStatus,
  BranchPurchaseRequestStatus,
  HqWarehousePickingTaskStatus,
  Role,
} from '@prisma/client';

export const AUTHORIZED_DISTRIBUTION_CANCEL_ROLES: Role[] = [
  Role.CEO,
  Role.OWNER,
  Role.HQ_SALES_MANAGER,
  Role.SYSTEM_ADMINISTRATOR,
];

export type CancellationInvestigation = {
  distributionOrderId: string;
  distributionOrderNumber: string;
  branchOrderId: string | null;
  branchOrderNumber: string | null;
  currentStatus: string;
  previousStatus: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelledByRole: string | null;
  cancellationReason: string | null;
  installmentId: string | null;
  installmentStatus: string | null;
  installmentApprovedBy: string | null;
  installmentApprovedAt: string | null;
  warehouseTaskId: string | null;
  reservationIds: string[];
  shipmentId: string | null;
  cancellationSource: string | null;
};

export type RepairSafetyResult = {
  safe: boolean;
  blockingRisks: string[];
  warnings: string[];
};

export type RepairPlan = {
  investigation: CancellationInvestigation;
  safety: RepairSafetyResult;
  plannedDistributionStatus: BranchDistributionOrderStatus | null;
  plannedBprStatus: BranchPurchaseRequestStatus | null;
  plannedPickingTaskStatus: HqWarehousePickingTaskStatus | null;
  needsPickingTask: boolean;
  clearCancelledAt: boolean;
  extendBookings: boolean;
  notifyWarehouse: boolean;
  alreadyRestored: boolean;
  plannedChanges: string[];
};

type AuditRow = {
  action: string;
  userId: string | null;
  role: string | null;
  timestamp: Date;
  metadata: unknown;
};

type PickingTaskRow = {
  id: string;
  status: HqWarehousePickingTaskStatus;
  pickedAt: Date | null;
  packedAt: Date | null;
  shippedAt: Date | null;
} | null;

type BookingRow = {
  id: string;
  status: string;
  bookedQuantity: number;
  confirmedQuantity: number | null;
};

type InstallmentRow = {
  id: string;
  status: BranchOrderInstallmentStatus;
  approvedById: string | null;
  decidedAt: Date | null;
  firstPaymentAmount: unknown;
} | null;

type OrderRow = {
  id: string;
  orderNumber: string;
  status: BranchDistributionOrderStatus;
  cancelledAt: Date | null;
  sentAt: Date | null;
  branchId: string;
  sourceWarehouseId: string;
};

type BprRow = {
  id: string;
  requestNumber: string | null;
  status: BranchPurchaseRequestStatus;
} | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function findCancellationActor(
  audits: AuditRow[],
  cancelledAt: Date | null,
): { userId: string | null; role: string | null; reason: string | null; source: string | null } {
  const cancelAudit = audits.find(
    (row) =>
      row.action === 'DISTRIBUTION_ORDER_CANCELLED' ||
      row.action === 'ORDER_CANCELLED' ||
      row.action === 'HQ_WAREHOUSE_ORDER_CANCELLATION_BLOCKED',
  );
  if (cancelAudit) {
    const meta = asRecord(cancelAudit.metadata);
    return {
      userId: cancelAudit.userId,
      role: cancelAudit.role,
      reason: typeof meta?.reason === 'string' ? meta.reason : null,
      source: cancelAudit.action,
    };
  }

  if (!cancelledAt) {
    return { userId: null, role: null, reason: null, source: null };
  }

  const windowStart = new Date(cancelledAt.getTime() - 2 * 60 * 1000);
  const windowEnd = new Date(cancelledAt.getTime() + 2 * 60 * 1000);
  const near = audits.filter((row) => row.timestamp >= windowStart && row.timestamp <= windowEnd);
  const warehouseNear = near.find((row) => row.role === Role.WAREHOUSE_MANAGER);
  if (warehouseNear) {
    return {
      userId: warehouseNear.userId,
      role: warehouseNear.role,
      reason: null,
      source: 'INFERRED_WAREHOUSE_MANAGER_ACTIVITY_NEAR_CANCELLATION',
    };
  }

  if (cancelledAt) {
    return {
      userId: null,
      role: Role.WAREHOUSE_MANAGER,
      reason: null,
      source: 'INFERRED_POST_distribution_orders_cancel_NO_AUDIT',
    };
  }

  return { userId: null, role: null, reason: null, source: null };
}

function inferPreviousDistributionStatus(
  audits: AuditRow[],
  cancelledAt: Date | null,
  pickingTask: PickingTaskRow,
): BranchDistributionOrderStatus | null {
  if (pickingTask?.shippedAt) return BranchDistributionOrderStatus.SHIPPED;
  if (pickingTask?.status === HqWarehousePickingTaskStatus.PACKED || pickingTask?.packedAt) {
    return BranchDistributionOrderStatus.PACKED;
  }
  if (
    pickingTask?.status === HqWarehousePickingTaskStatus.PICKING ||
    pickingTask?.pickedAt
  ) {
    return BranchDistributionOrderStatus.PICKING;
  }
  if (pickingTask) return BranchDistributionOrderStatus.SENT_TO_WAREHOUSE;

  const relevant = audits
    .filter((row) => cancelledAt ? row.timestamp < cancelledAt : true)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  for (const row of relevant) {
    if (row.action === 'GOODS_PACKED') return BranchDistributionOrderStatus.PACKED;
    if (row.action === 'GOODS_PICKED' || row.action === 'GOODS_PREPARED') {
      return BranchDistributionOrderStatus.PICKING;
    }
    if (row.action === 'ORDER_ASSIGNED_TO_WAREHOUSE' || row.action === 'HQ_WAREHOUSE_TASK_CREATED') {
      return BranchDistributionOrderStatus.SENT_TO_WAREHOUSE;
    }
    const meta = asRecord(row.metadata);
    if (typeof meta?.newStatus === 'string') {
      const status = meta.newStatus as BranchDistributionOrderStatus;
      if (status !== BranchDistributionOrderStatus.CANCELLED) return status;
    }
    if (typeof meta?.previousStatus === 'string') {
      return meta.previousStatus as BranchDistributionOrderStatus;
    }
  }

  return null;
}

export function deriveRestoredDistributionStatus(
  previousStatus: BranchDistributionOrderStatus | null,
  pickingTask: PickingTaskRow,
  installment: InstallmentRow,
  invoicePaid: boolean,
): BranchDistributionOrderStatus {
  if (previousStatus && previousStatus !== BranchDistributionOrderStatus.CANCELLED) {
    return previousStatus;
  }
  if (pickingTask?.shippedAt) return BranchDistributionOrderStatus.SHIPPED;
  if (pickingTask?.status === HqWarehousePickingTaskStatus.PACKED || pickingTask?.packedAt) {
    return BranchDistributionOrderStatus.PACKED;
  }
  if (pickingTask?.status === HqWarehousePickingTaskStatus.PICKING || pickingTask?.pickedAt) {
    return BranchDistributionOrderStatus.PICKING;
  }
  if (pickingTask) return BranchDistributionOrderStatus.SENT_TO_WAREHOUSE;
  if (
    installment?.status === BranchOrderInstallmentStatus.APPROVED ||
    invoicePaid
  ) {
    return BranchDistributionOrderStatus.SENT_TO_WAREHOUSE;
  }
  return BranchDistributionOrderStatus.SENT_TO_WAREHOUSE;
}

export function deriveRestoredBprStatus(
  distributionStatus: BranchDistributionOrderStatus,
): BranchPurchaseRequestStatus {
  if (
    distributionStatus === BranchDistributionOrderStatus.SHIPPED ||
    distributionStatus === BranchDistributionOrderStatus.SENT
  ) {
    return BranchPurchaseRequestStatus.SHIPPED;
  }
  if (
    distributionStatus === BranchDistributionOrderStatus.SENT_TO_WAREHOUSE ||
    distributionStatus === BranchDistributionOrderStatus.PICKING ||
    distributionStatus === BranchDistributionOrderStatus.PACKED
  ) {
    return BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE;
  }
  return BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE;
}

export function derivePickingTaskStatus(
  distributionStatus: BranchDistributionOrderStatus,
  existing: PickingTaskRow,
): HqWarehousePickingTaskStatus {
  if (existing?.status && existing.status !== HqWarehousePickingTaskStatus.SHIPPED) {
    return existing.status;
  }
  switch (distributionStatus) {
    case BranchDistributionOrderStatus.PACKED:
      return HqWarehousePickingTaskStatus.PACKED;
    case BranchDistributionOrderStatus.PICKING:
      return HqWarehousePickingTaskStatus.PICKING;
    default:
      return HqWarehousePickingTaskStatus.ASSIGNED;
  }
}

export function isUnauthorizedWarehouseCancellation(
  orderStatus: BranchDistributionOrderStatus,
  bprStatus: BranchPurchaseRequestStatus | null,
  installment: InstallmentRow,
  cancelledByRole: string | null,
  cancellationSource: string | null,
  bprCancelAudits: AuditRow[],
): boolean {
  if (orderStatus !== BranchDistributionOrderStatus.CANCELLED) return false;
  if (bprStatus === BranchPurchaseRequestStatus.CANCELLED) return false;
  if (installment?.status !== BranchOrderInstallmentStatus.APPROVED) return false;

  const authorizedBprCancel = bprCancelAudits.some(
    (row) =>
      row.action === 'HQ_ORDER_CANCELLED' &&
      row.role &&
      AUTHORIZED_DISTRIBUTION_CANCEL_ROLES.includes(row.role as Role),
  );
  if (authorizedBprCancel) return false;

  if (cancelledByRole && AUTHORIZED_DISTRIBUTION_CANCEL_ROLES.includes(cancelledByRole as Role)) {
    return false;
  }

  if (cancelledByRole === Role.WAREHOUSE_MANAGER) return true;
  if (cancellationSource === 'INFERRED_POST_distribution_orders_cancel_NO_AUDIT') return true;
  if (cancellationSource === 'INFERRED_WAREHOUSE_MANAGER_ACTIVITY_NEAR_CANCELLATION') return true;

  return false;
}

export function assessRepairSafety(input: {
  order: OrderRow;
  bpr: BprRow;
  installment: InstallmentRow;
  duplicateActiveOrders: number;
  duplicateShippedOrders: number;
  hasStockMovementsOut: boolean;
  unauthorizedWarehouseCancel: boolean;
}): RepairSafetyResult {
  const blockingRisks: string[] = [];
  const warnings: string[] = [];

  if (input.order.status !== BranchDistributionOrderStatus.CANCELLED) {
    blockingRisks.push('ORDER_NOT_CANCELLED');
  }
  if (!input.unauthorizedWarehouseCancel) {
    blockingRisks.push('CANCELLATION_NOT_CLASSIFIED_AS_UNAUTHORIZED_WAREHOUSE');
  }
  if (input.bpr?.status === BranchPurchaseRequestStatus.CANCELLED) {
    blockingRisks.push('BRANCH_PURCHASE_REQUEST_COMMERCIALLY_CANCELLED');
  }
  if (input.installment?.status !== BranchOrderInstallmentStatus.APPROVED) {
    blockingRisks.push('INSTALLMENT_NOT_APPROVED');
  }
  if (input.duplicateActiveOrders > 0) {
    blockingRisks.push('DUPLICATE_ACTIVE_DISTRIBUTION_ORDER_EXISTS');
  }
  if (input.duplicateShippedOrders > 0) {
    blockingRisks.push('PRODUCT_ALREADY_SHIPPED_ON_ANOTHER_ORDER');
  }
  if (input.hasStockMovementsOut) {
    warnings.push('STOCK_MOVEMENTS_OUT_EXIST_VERIFY_NO_DOUBLE_DEDUCTION');
  }

  return {
    safe: blockingRisks.length === 0,
    blockingRisks,
    warnings,
  };
}

export function buildRepairPlan(input: {
  order: OrderRow;
  bpr: BprRow;
  installment: InstallmentRow;
  pickingTask: PickingTaskRow;
  bookings: BookingRow[];
  audits: AuditRow[];
  bprAudits: AuditRow[];
  invoicePaid: boolean;
  duplicateActiveOrders: number;
  duplicateShippedOrders: number;
  hasStockMovementsOut: boolean;
  goodsReceivingId: string | null;
}): RepairPlan {
  const actor = findCancellationActor(input.audits, input.order.cancelledAt);
  const previousStatus = inferPreviousDistributionStatus(
    input.audits,
    input.order.cancelledAt,
    input.pickingTask,
  );

  const unauthorized = isUnauthorizedWarehouseCancellation(
    input.order.status,
    input.bpr?.status ?? null,
    input.installment,
    actor.role,
    actor.source,
    input.bprAudits,
  );

  const investigation: CancellationInvestigation = {
    distributionOrderId: input.order.id,
    distributionOrderNumber: input.order.orderNumber,
    branchOrderId: input.bpr?.id ?? null,
    branchOrderNumber: input.bpr?.requestNumber ?? null,
    currentStatus: input.order.status,
    previousStatus: previousStatus ?? null,
    cancelledAt: input.order.cancelledAt?.toISOString() ?? null,
    cancelledByUserId: actor.userId,
    cancelledByRole: actor.role,
    cancellationReason: actor.reason,
    installmentId: input.installment?.id ?? null,
    installmentStatus: input.installment?.status ?? null,
    installmentApprovedBy: input.installment?.approvedById ?? null,
    installmentApprovedAt: input.installment?.decidedAt?.toISOString() ?? null,
    warehouseTaskId: input.pickingTask?.id ?? null,
    reservationIds: input.bookings.map((row) => row.id),
    shipmentId: input.goodsReceivingId,
    cancellationSource: actor.source,
  };

  const safety = assessRepairSafety({
    order: input.order,
    bpr: input.bpr,
    installment: input.installment,
    duplicateActiveOrders: input.duplicateActiveOrders,
    duplicateShippedOrders: input.duplicateShippedOrders,
    hasStockMovementsOut: input.hasStockMovementsOut,
    unauthorizedWarehouseCancel: unauthorized,
  });

  const alreadyRestored = input.order.status !== BranchDistributionOrderStatus.CANCELLED;

  let plannedDistributionStatus: BranchDistributionOrderStatus | null = null;
  let plannedBprStatus: BranchPurchaseRequestStatus | null = null;
  let plannedPickingTaskStatus: HqWarehousePickingTaskStatus | null = null;
  let needsPickingTask = false;
  const plannedChanges: string[] = [];

  if (!alreadyRestored && safety.safe) {
    plannedDistributionStatus = deriveRestoredDistributionStatus(
      previousStatus,
      input.pickingTask,
      input.installment,
      input.invoicePaid,
    );
    plannedBprStatus = input.bpr
      ? deriveRestoredBprStatus(plannedDistributionStatus)
      : null;
    plannedPickingTaskStatus = derivePickingTaskStatus(plannedDistributionStatus, input.pickingTask);
    needsPickingTask = !input.pickingTask && plannedDistributionStatus !== BranchDistributionOrderStatus.CANCELLED;

    plannedChanges.push(`distribution.status: CANCELLED → ${plannedDistributionStatus}`);
    if (input.order.cancelledAt) plannedChanges.push('distribution.cancelledAt: clear');
    if (plannedBprStatus && input.bpr) {
      plannedChanges.push(`branchPurchaseRequest.status: ${input.bpr.status} → ${plannedBprStatus}`);
    }
    if (needsPickingTask) plannedChanges.push('hqWarehousePickingTask: create ASSIGNED');
    if (input.pickingTask && input.pickingTask.status !== plannedPickingTaskStatus) {
      plannedChanges.push(
        `hqWarehousePickingTask.status: ${input.pickingTask.status} → ${plannedPickingTaskStatus}`,
      );
    }
    plannedChanges.push('auditLog: UNAUTHORIZED_HQ_WAREHOUSE_CANCELLATION_REVERSED');
    plannedChanges.push('alert: notify HQ Warehouse Manager (if none active)');
  }

  return {
    investigation,
    safety,
    plannedDistributionStatus,
    plannedBprStatus,
    plannedPickingTaskStatus,
    needsPickingTask,
    clearCancelledAt: !alreadyRestored && safety.safe,
    extendBookings: !alreadyRestored && safety.safe && Boolean(input.bpr?.id),
    notifyWarehouse: !alreadyRestored && safety.safe,
    alreadyRestored,
    plannedChanges,
  };
}
