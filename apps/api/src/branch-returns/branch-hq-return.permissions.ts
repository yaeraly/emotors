import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import {
  hasAnyFullAccessRole,
  isBranchOwnerUser,
  isBranchSalesManagerUser,
  isBranchWarehouseOperator,
  resolveUserRoles,
} from '../rbac/rbac';

export function canCreateBranchHqReturn(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) return true;
  return isBranchWarehouseOperator(user);
}

export function canApproveBranchHqReturn(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles)) return true;
  return isBranchOwnerUser(user) || isBranchSalesManagerUser(user) || roles.includes(Role.MANAGER);
}

export function canOperateBranchHqReturnShipping(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  return canCreateBranchHqReturn(user);
}

export function canReceiveBranchHqReturnAtHq(user: Pick<AuthUser, 'role' | 'roles'>) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.WAREHOUSE_MANAGER);
}

export function canDecideBranchHqReturnFinance(user: Pick<AuthUser, 'role' | 'roles'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.HQ_ACCOUNTANT) ||
    roles.includes(Role.FINANCE_MANAGER)
  );
}

export function canViewAllBranchHqReturns(user: Pick<AuthUser, 'role' | 'roles'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.CEO) ||
    roles.includes(Role.WAREHOUSE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT) ||
    roles.includes(Role.FINANCE_MANAGER)
  );
}

export function canViewBranchHqReturns(user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>) {
  return (
    canViewAllBranchHqReturns(user) ||
    canCreateBranchHqReturn(user) ||
    canApproveBranchHqReturn(user)
  );
}
