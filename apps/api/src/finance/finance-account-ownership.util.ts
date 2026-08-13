import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FinanceAccountScope, FinanceAccountStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import {
  hasAnyFullAccessRole,
  isBranchAccountantUser,
  isBranchOwnerUser,
  resolveUserRoles,
} from '../rbac/rbac';
import { Role } from '@prisma/client';

/** Spec audit aliases stored in metadata alongside finance.account.* actions. */
export const ACCOUNT_OWNERSHIP_AUDIT = {
  CREATED: 'ACCOUNT_CREATED',
  UPDATED: 'ACCOUNT_UPDATED',
  DELETED: 'ACCOUNT_DELETED',
  SELECTED_FOR_PAYMENT: 'ACCOUNT_SELECTED_FOR_PAYMENT',
  OWNER_CHANGED: 'ACCOUNT_OWNER_CHANGED',
} as const;

export type FinanceAccountOwnerFields = {
  id?: string;
  scope: FinanceAccountScope;
  branchId: string | null;
  status?: FinanceAccountStatus;
  deletedAt?: Date | null;
};

/**
 * Every account belongs to exactly one owner:
 * - HQ → scope=HQ and branchId=null
 * - Branch → scope=BRANCH and branchId set
 */
export function assertFinanceAccountOwnershipInvariant(account: FinanceAccountOwnerFields) {
  if (account.scope === FinanceAccountScope.HQ) {
    if (account.branchId != null) {
      throw new BadRequestException('HQ accounts cannot belong to a branch');
    }
    return;
  }

  if (account.scope === FinanceAccountScope.BRANCH) {
    if (!account.branchId) {
      throw new BadRequestException('Branch accounts must belong to exactly one branch');
    }
    return;
  }

  throw new BadRequestException('Account owner type must be HQ or BRANCH');
}

/** Normalize create/update ownership fields so an account cannot exist without an owner. */
export function resolveFinanceAccountOwner(input: {
  scope?: FinanceAccountScope;
  branchId?: string | null;
  userBranchId?: string | null;
}): { scope: FinanceAccountScope; branchId: string | null } {
  const scope =
    input.scope ??
    (input.userBranchId ? FinanceAccountScope.BRANCH : FinanceAccountScope.HQ);
  const branchId =
    scope === FinanceAccountScope.BRANCH
      ? (input.branchId ?? input.userBranchId ?? null)
      : null;

  const owner = { scope, branchId };
  assertFinanceAccountOwnershipInvariant(owner);
  return owner;
}

export function canBrowseAllFinanceAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
) {
  const roles = resolveUserRoles(user);
  if (user.branchId) return false;
  return (
    hasAnyFullAccessRole(roles) ||
    roles.includes(Role.CEO) ||
    roles.includes(Role.OWNER) ||
    roles.includes(Role.FINANCE_MANAGER)
  );
}

/** HQ Accountant / HQ operational users may use only HQ-owned accounts. */
export function canUseOnlyHqOwnedAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId'>,
) {
  const roles = resolveUserRoles(user);
  if (user.branchId) return false;
  if (hasAnyFullAccessRole(roles) || roles.includes(Role.FINANCE_MANAGER)) {
    return false;
  }
  return roles.includes(Role.HQ_ACCOUNTANT) || roles.includes(Role.HQ_CASHIER);
}

/**
 * Prisma where-clause for account selectors:
 * Branch → own BRANCH ACTIVE accounts
 * HQ operational → HQ ACTIVE accounts
 * HQ CEO / Finance Manager → may browse all (optional branch filter)
 */
export function buildSelectableOwnerAccountsWhere(
  user: AuthUser,
  options: {
    forPayment?: boolean;
    requestedBranchId?: string;
    includeInactive?: boolean;
  } = {},
): Prisma.FinanceAccountWhereInput {
  const forPayment = options.forPayment !== false;
  const statusFilter: Prisma.FinanceAccountWhereInput = forPayment
    ? { status: FinanceAccountStatus.ACTIVE }
    : options.includeInactive
      ? {}
      : { status: FinanceAccountStatus.ACTIVE };

  const base: Prisma.FinanceAccountWhereInput = {
    deletedAt: null,
    ...statusFilter,
  };

  if (user.branchId) {
    return {
      ...base,
      scope: FinanceAccountScope.BRANCH,
      branchId: user.branchId,
    };
  }

  if (canBrowseAllFinanceAccounts(user) && options.requestedBranchId) {
    return {
      ...base,
      scope: FinanceAccountScope.BRANCH,
      branchId: options.requestedBranchId,
    };
  }

  if (canBrowseAllFinanceAccounts(user) && !forPayment && !options.requestedBranchId) {
    return base;
  }

  return {
    ...base,
    scope: FinanceAccountScope.HQ,
    branchId: null,
  };
}

/**
 * Backend validation before a payment/debit uses an account.
 * Rejects cross-owner, cross-branch, inactive, and deleted accounts.
 */
export function assertAccountUsableByOwner(
  user: AuthUser,
  account: FinanceAccountOwnerFields,
  options: { expectedBranchId?: string | null; requireActive?: boolean } = {},
) {
  assertFinanceAccountOwnershipInvariant(account);

  if (account.deletedAt) {
    throw new BadRequestException('Deleted accounts cannot be selected');
  }

  const requireActive = options.requireActive !== false;
  if (requireActive && account.status && account.status !== FinanceAccountStatus.ACTIVE) {
    throw new BadRequestException('Only active accounts can be selected for payment');
  }

  const roles = resolveUserRoles(user);

  if (user.branchId) {
    if (account.scope !== FinanceAccountScope.BRANCH) {
      throw new ForbiddenException('Branch users cannot use HQ accounts');
    }
    if (account.branchId !== user.branchId) {
      throw new ForbiddenException('Branch users cannot use another branch account');
    }
    if (options.expectedBranchId && account.branchId !== options.expectedBranchId) {
      throw new ForbiddenException('Account does not belong to the invoice branch');
    }
    return;
  }

  // HQ users
  if (account.scope !== FinanceAccountScope.HQ) {
    if (hasAnyFullAccessRole(roles) || roles.includes(Role.FINANCE_MANAGER)) {
      // Browse/view allowed elsewhere; payment use of Branch accounts by HQ is blocked.
      throw new ForbiddenException('HQ payment operations must use HQ accounts');
    }
    throw new ForbiddenException('HQ accountants can only use HQ accounts');
  }
}

export function assertBranchUserOwnsAccountBranch(
  user: Pick<AuthUser, 'branchId'>,
  accountBranchId: string | null | undefined,
) {
  if (!user.branchId) return;
  if (!accountBranchId || user.branchId !== accountBranchId) {
    throw new ForbiddenException('Branch isolation violation');
  }
}

export function canManageOwnBranchAccounts(
  user: Pick<AuthUser, 'role' | 'roles' | 'permissions' | 'branchId'>,
) {
  return (
    !!user.branchId &&
    (isBranchAccountantUser(user) || isBranchOwnerUser(user))
  );
}
