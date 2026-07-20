import type { User } from './types';
import {
  hasPermission,
  isBranchAccountantUser,
  isBranchCashierUser,
  isBranchOwnerUser,
  hasFullAccess,
  hasRole,
} from './rbac';

export function isHqFinanceUser(user: Pick<User, 'role' | 'roles' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return hasRole(user, 'FINANCE_MANAGER') || hasRole(user, 'HQ_ACCOUNTANT');
}

export function canManageFinanceAccounts(user: Pick<User, 'role' | 'roles' | 'permissions' | 'branchId'> | null | undefined) {
  if (!user) return false;
  if (isHqFinanceUser(user) && !user.branchId) return true;
  return isBranchAccountantUser(user) || hasPermission(user, 'finance.manage');
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

export function canAcceptFinancePayment(user: Pick<User, 'role' | 'roles' | 'branchId' | 'permissions'> | null | undefined) {
  if (!user) return false;
  return isBranchCashierUser(user) || hasPermission(user, 'payments.manage');
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
