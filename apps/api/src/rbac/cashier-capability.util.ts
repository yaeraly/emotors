import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import {
  hasAnyFullAccessRole,
  isBranchOwnerUser,
  resolveUserPermissions,
  resolveUserRoles,
  userHasPermission,
} from './rbac';

export const CASHIER_CAPABILITY_PERMISSION = 'cashier';

export const CASHIER_ASSIGNMENT_OPERATIONS = {
  RECEIVE_PAYMENTS: 'RECEIVE_PAYMENTS',
  RECEIVE_INSTALLMENTS: 'RECEIVE_INSTALLMENTS',
  RECEIVE_RESERVATIONS: 'RECEIVE_RESERVATIONS',
  PROCESS_REFUNDS: 'PROCESS_REFUNDS',
  VIEW_BALANCE: 'VIEW_BALANCE',
  CREATE_TRANSFERS: 'CREATE_TRANSFERS',
  OPEN_SHIFT: 'OPEN_SHIFT',
  CLOSE_SHIFT: 'CLOSE_SHIFT',
} as const;

export type CashierAssignmentOperation =
  (typeof CASHIER_ASSIGNMENT_OPERATIONS)[keyof typeof CASHIER_ASSIGNMENT_OPERATIONS];

export const DEFAULT_CASHIER_ASSIGNMENT_OPERATIONS: CashierAssignmentOperation[] = [
  CASHIER_ASSIGNMENT_OPERATIONS.RECEIVE_PAYMENTS,
  CASHIER_ASSIGNMENT_OPERATIONS.RECEIVE_INSTALLMENTS,
  CASHIER_ASSIGNMENT_OPERATIONS.RECEIVE_RESERVATIONS,
  CASHIER_ASSIGNMENT_OPERATIONS.PROCESS_REFUNDS,
  CASHIER_ASSIGNMENT_OPERATIONS.VIEW_BALANCE,
  CASHIER_ASSIGNMENT_OPERATIONS.OPEN_SHIFT,
  CASHIER_ASSIGNMENT_OPERATIONS.CLOSE_SHIFT,
];

export function expandCashierCapabilityPermissions(permissions: string[]) {
  const expanded = new Set(permissions);
  if (expanded.has(CASHIER_CAPABILITY_PERMISSION)) {
    expanded.add('payments.manage');
  }
  return Array.from(expanded);
}

export function hasCashierCapability(user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>) {
  if (!user.branchId) return false;
  const roles = resolveUserRoles(user);
  if (roles.includes(Role.HQ_CASHIER)) return false;
  if (hasAnyFullAccessRole(roles)) return false;
  return userHasPermission(user, CASHIER_CAPABILITY_PERMISSION) || roles.includes(Role.CASHIER);
}

export function canGrantCashierCapability(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  return isBranchOwnerUser(user);
}

export function canRevokeCashierCapability(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  return isBranchOwnerUser(user);
}

export function usesAssignedAccountVisibility(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return hasCashierCapability(user) && !userHasPermission(user, 'finance.manage') && !isBranchOwnerUser(user);
}

export function assertCashierCapability(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  if (!hasCashierCapability(user)) {
    throw new ForbiddenException('Cashier permission is required for this operation');
  }
}

export function assertAssignmentOperationAllowed(
  allowedOperations: string[],
  operation: CashierAssignmentOperation,
) {
  if (!allowedOperations.includes(operation)) {
    throw new ForbiddenException(`Operation ${operation} is not allowed for this account assignment`);
  }
}

export function isAssignmentCurrentlyActive(assignment: {
  isActive: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  if (!assignment.isActive) return false;
  const now = new Date();
  if (assignment.startDate && assignment.startDate > now) return false;
  if (assignment.endDate && assignment.endDate < now) return false;
  return true;
}

export function resolveEffectivePermissions(user: Pick<AuthUser, 'role' | 'roles' | 'permissions'>) {
  return expandCashierCapabilityPermissions(resolveUserPermissions(user));
}
