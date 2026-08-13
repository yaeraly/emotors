import type { User } from './types';
import {
  hasPermission,
  isBranchAccountantUser,
  isBranchCashierUser,
  isBranchOwnerUser,
  hasFullAccess,
  hasRole,
} from './rbac';
import { hasCashierCapability } from './cashier-capability';

export function isHqFinanceUser(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasRole(user, 'FINANCE_MANAGER') || hasRole(user, 'HQ_ACCOUNTANT');
}

export function canPrepareFinanceTransfer(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'FINANCE_MANAGER') || hasRole(user, 'HQ_ACCOUNTANT');
}

export function canConfirmFinanceTransfer(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'HQ_CASHIER');
}

export function canReverseFinanceTransfer(user: Pick<User, 'role' | 'roles'> | null | undefined) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'FINANCE_MANAGER');
}

export function canManageFinanceAccounts(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isHqFinanceUser(user) && !user.branchId) return true;
  return isBranchAccountantUser(user) || hasPermission(user, 'finance.manage');
}

/** HQ Accountant / Finance Manager operational HQ account management. */
export function canOperateHqFinanceAccounts(
  user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined,
) {
  if (!user || user.branchId) return false;
  return (
    hasRole(user, 'HQ_ACCOUNTANT') ||
    hasRole(user, 'FINANCE_MANAGER') ||
    hasFullAccess(user)
  );
}

/** CEO/Owner approve HQ account archive and restoration. */
export function canApproveFinanceAccountLifecycle(
  user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
) {
  if (!user) return false;
  return hasFullAccess(user) || hasRole(user, 'CEO') || hasRole(user, 'OWNER');
}

export function canViewFinanceDashboard(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isBranchCashierUser(user)) return false;
  return hasPermission(user, 'finance.view') || hasPermission(user, 'finance.manage');
}

export function canViewFinanceReports(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isBranchCashierUser(user)) return false;
  return (
    isHqFinanceUser(user) ||
    isBranchOwnerUser(user) ||
    isBranchAccountantUser(user) ||
    hasPermission(user, 'finance.view')
  );
}

export function canCreateOwnerInvestment(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user) return false;
  return isBranchOwnerUser(user) || hasFullAccess(user);
}

/** CEO / Owner (full access) or franchise owners who already create investments. */
export function canManageFinanceInvestments(
  user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined,
) {
  if (!user) return false;
  return (
    hasFullAccess(user) ||
    hasRole(user, 'CEO') ||
    hasRole(user, 'OWNER') ||
    canCreateOwnerInvestment(user)
  );
}

export function canAcceptFinancePayment(user: Pick<User, 'role' | 'roles' | 'branchId' | 'permissions' | 'additionalPermissions'> | null | undefined) {
  if (!user) return false;
  return hasCashierCapability(user);
}

export function canViewFinancePayments(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  return (
    canAcceptFinancePayment(user) ||
    canManageFinanceAccounts(user) ||
    isBranchOwnerUser(user) ||
    isHqFinanceUser(user) ||
    hasPermission(user, 'finance.view')
  );
}

export const BRANCH_CASHIER_FINANCE_FORBIDDEN_PREFIXES = [
  '/finance/dashboard',
  '/finance/income',
  '/finance/expenses',
  '/finance/transfers',
  '/finance/investments',
  '/finance/reconciliation',
  '/finance/cash-flow',
  '/finance/reports',
  '/finance/audit',
  '/finance/accounts/new',
];

export function isBranchCashierFinanceForbiddenPath(pathname: string) {
  return BRANCH_CASHIER_FINANCE_FORBIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
