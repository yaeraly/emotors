import { BranchHqReturnStatus } from '@prisma/client';

const BRANCH_WAREHOUSE_EDITABLE = new Set<BranchHqReturnStatus>([BranchHqReturnStatus.DRAFT]);

const BRANCH_WAREHOUSE_SHIP_FLOW = new Set<BranchHqReturnStatus>([
  BranchHqReturnStatus.BRANCH_APPROVED,
  BranchHqReturnStatus.READY_TO_SHIP,
  BranchHqReturnStatus.PICKING,
  BranchHqReturnStatus.PACKED,
]);

const HQ_RECEIVE_FLOW = new Set<BranchHqReturnStatus>([
  BranchHqReturnStatus.SHIPPED_TO_HQ,
  BranchHqReturnStatus.DISCREPANCY,
  BranchHqReturnStatus.RECEIVED_AT_HQ,
]);

export function canEditBranchHqReturnDraft(status: BranchHqReturnStatus) {
  return BRANCH_WAREHOUSE_EDITABLE.has(status);
}

export function canSubmitBranchHqReturn(status: BranchHqReturnStatus) {
  return status === BranchHqReturnStatus.DRAFT;
}

export function canApproveOrRejectBranchHqReturn(status: BranchHqReturnStatus) {
  return status === BranchHqReturnStatus.PENDING_BRANCH_APPROVAL;
}

export function canPickPackShipBranchHqReturn(status: BranchHqReturnStatus) {
  return BRANCH_WAREHOUSE_SHIP_FLOW.has(status);
}

export function canShipBranchHqReturn(status: BranchHqReturnStatus) {
  return (
    status === BranchHqReturnStatus.PACKED ||
    status === BranchHqReturnStatus.PICKING ||
    status === BranchHqReturnStatus.READY_TO_SHIP ||
    status === BranchHqReturnStatus.BRANCH_APPROVED
  );
}

export function canReceiveBranchHqReturnAtHq(status: BranchHqReturnStatus) {
  return HQ_RECEIVE_FLOW.has(status) || status === BranchHqReturnStatus.SHIPPED_TO_HQ;
}

export function canFinanceAdjustBranchHqReturn(status: BranchHqReturnStatus) {
  return (
    status === BranchHqReturnStatus.HQ_ACCEPTED ||
    status === BranchHqReturnStatus.DISCREPANCY ||
    status === BranchHqReturnStatus.RECEIVED_AT_HQ
  );
}

export function allItemsPicked(
  items: Array<{ quantity: number; pickedAt?: Date | string | null }>,
) {
  const eligible = items.filter((item) => Number(item.quantity) > 0);
  if (!eligible.length) return false;
  return eligible.every((item) => item.pickedAt != null);
}
