import type { User } from './types';
import { hasPermission, isBranchCashierUser, isBranchOwnerUser } from './rbac';

export const CASHIER_CAPABILITY_PERMISSION = 'cashier';

export function hasCashierCapability(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId' | 'additionalPermissions'> | null | undefined) {
  if (!user?.branchId) return false;
  if (
    hasPermission(user, CASHIER_CAPABILITY_PERMISSION) ||
    user.additionalPermissions?.includes(CASHIER_CAPABILITY_PERMISSION)
  ) {
    return true;
  }
  return isBranchCashierUser(user);
}

export function canGrantCashierCapability(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  return isBranchOwnerUser(user);
}

export function usesAssignedAccountVisibility(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId' | 'additionalPermissions'> | null | undefined) {
  return hasCashierCapability(user) && !hasPermission(user, 'finance.manage') && !isBranchOwnerUser(user);
}
