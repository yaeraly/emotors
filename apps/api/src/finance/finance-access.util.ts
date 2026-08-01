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
import {
  canBrowseAllFinanceAccounts,
  canManageOwnBranchAccounts,
} from './finance-account-ownership.util';

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
  // Branch CEO and Branch Accountant may manage accounts of their own branch only.
  return (
    canManageOwnBranchAccounts(user) ||
    isBranchAccountantUser(user) ||
    userHasPermission(user, 'finance.manage')
  );
}

export function canManageHqFinanceAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return isHqFinanceUser(user) && !user.branchId;
}

/** Operational HQ account management (create/edit/assign/activate/block/request archive). */
export function canOperateHqFinanceAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  const roles = resolveUserRoles(user);
  if (user.branchId) return false;
  return (
    roles.includes(Role.HQ_ACCOUNTANT) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    hasAnyFullAccessRole(roles)
  );
}

/**
 * CEO/Owner approve high-level HQ account lifecycle changes
 * (archive approval + restoration). Not day-to-day account creation.
 */
export function canApproveFinanceAccountLifecycle(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.CEO) ||
    roles.includes(Role.OWNER)
  );
}

export function canManageBranchFinanceAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return (
    canManageOwnBranchAccounts(user) ||
    (!!user.branchId && userHasPermission(user, 'finance.manage'))
  );
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

/** CEO/Owner (full access) or branch owner who already manages investments. */
export function canManageFinanceInvestments(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.CEO) ||
    roles.includes(Role.OWNER) ||
    canCreateOwnerInvestment(user)
  );
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

/** HQ Accountant prepares HQ account transfers (draft → send to cashier). */
export function canPrepareFinanceTransfer(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT)
  );
}

/** Only HQ Cashier (or full-access) confirms HQ transfers after receipt upload. */
export function canConfirmFinanceTransfer(
  user: Pick<AuthUser, 'role' | 'roles'>,
) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.HQ_CASHIER);
}

export function canReturnFinanceTransfer(
  user: Pick<AuthUser, 'role' | 'roles'>,
) {
  return canConfirmFinanceTransfer(user);
}

export function canCancelFinanceTransfer(
  user: Pick<AuthUser, 'role' | 'roles'>,
) {
  const roles = resolveUserRoles(user);
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.FINANCE_MANAGER) ||
    roles.includes(Role.HQ_ACCOUNTANT)
  );
}

export function canReverseFinanceTransfer(
  user: Pick<AuthUser, 'role' | 'roles'>,
) {
  const roles = resolveUserRoles(user);
  return hasAnyFullAccessRole(roles) || roles.includes(Role.FINANCE_MANAGER);
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

  // HQ CEO / Owner / Finance Manager may browse all owners (HQ + every Branch).
  if (canBrowseAllFinanceAccounts(user)) {
    return;
  }

  // HQ Accountant may access only HQ-owned accounts (never Branch accounts).
  if (roles.includes(Role.HQ_ACCOUNTANT) && !user.branchId) {
    if (account.scope !== FinanceAccountScope.HQ || account.branchId != null) {
      throw new ForbiddenException('HQ accountants can only access HQ accounts');
    }
    return;
  }

  // HQ Cashier may access only HQ accounts they are assigned to (access grant, not ownership).
  if (roles.includes(Role.HQ_CASHIER)) {
    if (account.scope !== FinanceAccountScope.HQ) {
      throw new ForbiddenException('HQ cashiers can only access HQ accounts');
    }
    if (!assignedAccountIds.has(account.id)) {
      throw new ForbiddenException('Cashier can only access assigned accounts');
    }
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

  // HQ CEO / Owner / Finance Manager: all accounts, optional Branch drill-down.
  if (canBrowseAllFinanceAccounts(user)) {
    if (requestedBranchId) {
      return { scope: FinanceAccountScope.BRANCH, branchId: requestedBranchId };
    }
    return {};
  }

  // HQ Accountant: strictly HQ-owned accounts.
  if (roles.includes(Role.HQ_ACCOUNTANT) && !user.branchId) {
    return { scope: FinanceAccountScope.HQ, branchId: null };
  }

  if (!user.branchId) {
    return { scope: FinanceAccountScope.HQ, branchId: null };
  }

  // Branch users (CEO, Accountant, Cashier): only their Branch accounts.
  return { scope: FinanceAccountScope.BRANCH, branchId: user.branchId };
}
