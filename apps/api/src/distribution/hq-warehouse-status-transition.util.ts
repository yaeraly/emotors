import { BranchDistributionOrderStatus } from '@prisma/client';

/**
 * HQ Warehouse Manager may only execute warehouse fulfillment transitions.
 * Commercial destructive statuses are never allowed for this role.
 */
export const HQ_WAREHOUSE_ALLOWED_TRANSITIONS: ReadonlyArray<
  readonly [BranchDistributionOrderStatus, BranchDistributionOrderStatus]
> = [
  [BranchDistributionOrderStatus.SENT_TO_WAREHOUSE, BranchDistributionOrderStatus.PICKING],
  [BranchDistributionOrderStatus.PICKING, BranchDistributionOrderStatus.PACKED],
  [BranchDistributionOrderStatus.PACKED, BranchDistributionOrderStatus.SHIPPED],
] as const;

export const HQ_WAREHOUSE_BLOCKED_STATUSES: ReadonlyArray<BranchDistributionOrderStatus> = [
  BranchDistributionOrderStatus.CANCELLED,
] as const;

export function isHqWarehouseAllowedTransition(
  from: BranchDistributionOrderStatus | string,
  to: BranchDistributionOrderStatus | string,
): boolean {
  return HQ_WAREHOUSE_ALLOWED_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

export function isHqWarehouseBlockedTargetStatus(
  to: BranchDistributionOrderStatus | string,
): boolean {
  return HQ_WAREHOUSE_BLOCKED_STATUSES.includes(to as BranchDistributionOrderStatus);
}

/** Russian message returned when HQ Warehouse Manager attempts cancellation. */
export const HQ_WAREHOUSE_CANCEL_FORBIDDEN_MESSAGE =
  'У менеджера склада HQ нет права отменять заказ филиала.';
