import { Role } from '@prisma/client';
import { isFullAccessRole } from '../rbac/rbac';

export const PROCUREMENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PROCUREMENT_UNLOCK_DURATION_MS = 24 * 60 * 60 * 1000;

export const SENT_TO_SUPPLIER_STATUSES = ['ORDERED', 'SENT_TO_SUPPLIER'] as const;

export type ProcurementEditWindowStatus =
  | 'DRAFT_EDITABLE'
  | 'EDITABLE'
  | 'LOCKED'
  | 'CEO_UNLOCKED';

export type ProcurementEditState = {
  sentToSupplierAt: Date | null;
  editableUntil: Date | null;
  unlockedAt: Date | null;
  unlockExpiresAt: Date | null;
  isEditable: boolean;
  editWindowStatus: ProcurementEditWindowStatus;
  secondsRemaining: number | null;
};

export type ProcurementEditWindowOrder = {
  status: string;
  sentToSupplierAt?: Date | string | null;
  editableUntil?: Date | string | null;
  unlockedAt?: Date | string | null;
  unlockExpiresAt?: Date | string | null;
  hqStockMovementCreatedAt?: Date | string | null;
};

export function triggersSentToSupplierWindow(status: string) {
  return (SENT_TO_SUPPLIER_STATUSES as readonly string[]).includes(status);
}

export function computeSentToSupplierTimestamps(now = new Date()) {
  return {
    sentToSupplierAt: now,
    editableUntil: new Date(now.getTime() + PROCUREMENT_EDIT_WINDOW_MS),
  };
}

export function computeUnlockExpiry(now = new Date()) {
  return new Date(now.getTime() + PROCUREMENT_UNLOCK_DURATION_MS);
}

export function isProcurementOrderCompleted(order: ProcurementEditWindowOrder) {
  return (
    order.status === 'CLOSED' ||
    order.status === 'RECEIVED_TO_HQ_WAREHOUSE' ||
    order.status === 'CANCELLED'
  );
}

export function resolveProcurementEditState(
  order: ProcurementEditWindowOrder,
  now = new Date(),
): ProcurementEditState {
  const sentToSupplierAt = order.sentToSupplierAt ? new Date(order.sentToSupplierAt) : null;
  const editableUntil = order.editableUntil ? new Date(order.editableUntil) : null;
  const unlockedAt = order.unlockedAt ? new Date(order.unlockedAt) : null;
  const unlockExpiresAt = order.unlockExpiresAt ? new Date(order.unlockExpiresAt) : null;
  const received = !!order.hqStockMovementCreatedAt;
  const completed = isProcurementOrderCompleted(order);

  if (!sentToSupplierAt || !editableUntil) {
    return {
      sentToSupplierAt,
      editableUntil,
      unlockedAt,
      unlockExpiresAt,
      isEditable: !completed && !received,
      editWindowStatus: completed || received ? 'LOCKED' : 'DRAFT_EDITABLE',
      secondsRemaining: null,
    };
  }

  const inInitialWindow = now.getTime() <= editableUntil.getTime();
  const inUnlockWindow =
    !!unlockExpiresAt && now.getTime() <= unlockExpiresAt.getTime();

  let editWindowStatus: ProcurementEditWindowStatus;
  if (inUnlockWindow) {
    editWindowStatus = 'CEO_UNLOCKED';
  } else if (inInitialWindow) {
    editWindowStatus = 'EDITABLE';
  } else {
    editWindowStatus = 'LOCKED';
  }

  const isEditable = !completed && !received && (inInitialWindow || inUnlockWindow);
  const activeUntil = inUnlockWindow
    ? unlockExpiresAt
    : inInitialWindow
      ? editableUntil
      : null;
  const secondsRemaining = activeUntil
    ? Math.max(0, Math.floor((activeUntil.getTime() - now.getTime()) / 1000))
    : null;

  return {
    sentToSupplierAt,
    editableUntil,
    unlockedAt,
    unlockExpiresAt,
    isEditable,
    editWindowStatus,
    secondsRemaining,
  };
}

export function resolveUserRoles(user: { role: Role; roles?: Role[] }) {
  return user.roles?.length ? user.roles : [user.role];
}

export function canUnlockProcurementOrder(user: { role: Role; roles?: Role[] }) {
  const roles = resolveUserRoles(user);
  return roles.some((role) => isFullAccessRole(role) || role === Role.CEO || role === Role.OWNER);
}

export function canUserEditProcurementItems(
  user: { role: Role; roles?: Role[] },
  editState: ProcurementEditState,
) {
  if (!editState.isEditable) {
    return false;
  }

  const roles = resolveUserRoles(user);
  if (roles.some((role) => isFullAccessRole(role) || role === Role.CEO || role === Role.OWNER)) {
    return true;
  }

  if (
    roles.includes(Role.WAREHOUSE_MANAGER) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT) ||
    roles.includes(Role.ACCOUNTANT)
  ) {
    return false;
  }

  if (
    roles.includes(Role.SUPPLY_CHAIN_MANAGER) ||
    roles.includes(Role.PROCUREMENT_MANAGER)
  ) {
    return editState.editWindowStatus === 'EDITABLE' || editState.editWindowStatus === 'DRAFT_EDITABLE';
  }

  return false;
}

export const PROCUREMENT_EDIT_WINDOW_EXPIRED_MESSAGE =
  '24-hour edit window has expired';
