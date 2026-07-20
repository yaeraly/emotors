import { ForbiddenException } from '@nestjs/common';
import { FinanceAccountScope, Role } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import {
  hasAnyFullAccessRole,
  isBranchAccountantUser,
  isBranchOwnerUser,
  resolveUserRoles,
  userHasPermission,
} from '../rbac/rbac';
import { hasCashierCapability } from '../rbac/cashier-capability.util';

export type FinanceAccountAccess = {
  id: string;
  branchId: string | null;
  scope: FinanceAccountScope;
};

export function isHqFinanceUser(user: Pick<AuthUser, 'role' | 'roles'>) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT)
  );
}

export function canManageFinanceAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  if (isHqFinanceUser(user) && !user.branchId) return true;
  return isBranchAccountantUser(user) || userHasPermission(user, 'finance.manage');
}

export function canManageHqFinanceAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return isHqFinanceUser(user) && !user.branchId;
}

export function canManageBranchFinanceAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return !!user.branchId && (isBranchAccountantUser(user) || userHasPermission(user, 'finance.manage'));
}

export function canViewFinanceReports(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return (
    isHqFinanceUser(user) ||
    isBranchOwnerUser(user) ||
    isBranchAccountantUser(user) ||
    userHasPermission(user, 'finance.view')
  );
}

export function canCreateOwnerInvestment(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
) {
  return isBranchOwnerUser(user) || hasAnyFullAccessRole(resolveUserRoles(user));
}

export function canApproveFinanceTransfer(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
) {
  return (
    isBranchOwnerUser(user) ||
    isHqFinanceUser(user) ||
    hasAnyFullAccessRole(resolveUserRoles(user))
  );
}

export function canOperateCashierShift(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return hasCashierCapability(user);
}

export function assertBranchIsolation(
  user: Pick<AuthUser, 'branchId'>,
  branchId: string | null | undefined,
) {
  if (!user.branchId || !branchId) return;
  if (user.branchId !== branchId) {
    throw new ForbiddenException('Branch isolation violation');
  }
}

export function assertCanAccessAccountScope(
  user: AuthUser,
  account: FinanceAccountAccess,
  assignedAccountIds: Set<string> = new Set(),
) {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles) || isHqFinanceUser(user)) {
    return;
  }

  if (account.scope === FinanceAccountScope.HQ) {
    throw new ForbiddenException('HQ accounts are not accessible from branch context');
  }

  if (isBranchAccountantUser(user) || isBranchOwnerUser(user)) {
    assertBranchIsolation(user, account.branchId);
    return;
  }

  if (hasCashierCapability(user)) {
    assertBranchIsolation(user, account.branchId);
    if (!assignedAccountIds.has(account.id)) {
      throw new ForbiddenException('Cashier can only access assigned accounts');
    }
    return;
  }

  if (userHasPermission(user, 'finance.view')) {
    if (user.branchId) {
      assertBranchIsolation(user, account.branchId);
    }
    return;
  }

  throw new ForbiddenException('Forbidden');
}

export function resolveFinanceScopeFilter(
  user: AuthUser,
  requestedBranchId?: string,
): { scope?: FinanceAccountScope; branchId?: string | null } {
  const roles = resolveUserRoles(user);
  if (hasAnyFullAccessRole(roles) || isHqFinanceUser(user)) {
    if (requestedBranchId) {
      return { scope: FinanceAccountScope.BRANCH, branchId: requestedBranchId };
    }
    if (!user.branchId) {
      return {};
    }
  }

  if (!user.branchId) {
    return { scope: FinanceAccountScope.HQ, branchId: null };
  }

  return { scope: FinanceAccountScope.BRANCH, branchId: user.branchId };
}
