import { hasFullAccess, isBranchWarehouseOperator, isWarehouseManagerUser } from './rbac';
import type { User } from './types';

/**
 * HQ and Branch Warehouse managers/operators must not see monetary inventory discrepancies.
 * Full-access financial roles keep visibility.
 */
export function shouldHideInventoryCountFinancials(
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined,
) {
  if (!user || hasFullAccess(user)) return false;
  return isBranchWarehouseOperator(user) || isWarehouseManagerUser(user);
}

export function shouldShowInventoryCountDiscrepancyTotal(input?: {
  hideItemFinancials?: boolean;
}) {
  return !input?.hideItemFinancials;
}

export function shouldShowInventoryCountItemCostColumns(input: {
  hideItemFinancials?: boolean;
}) {
  return !input.hideItemFinancials;
}
