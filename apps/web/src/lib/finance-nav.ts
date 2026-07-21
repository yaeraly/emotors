import type { ModuleSectionLink } from '@/components/ModuleSectionNav';
import type { User } from './types';
import { hasCashierCapability } from './cashier-capability';
import { canManageFinanceAccounts, isHqFinanceUser } from './finance-rbac';

export type FinanceNavSection = ModuleSectionLink & {
  roles: Array<'cashier' | 'manage' | 'view' | 'owner' | 'hq'>;
};

export const FINANCE_MAIN_NAV: FinanceNavSection[] = [
  { href: '/finance/dashboard', labelKey: 'finance.dashboard', roles: ['view', 'manage', 'owner', 'hq'] },
  { href: '/finance/accounts', labelKey: 'finance.accounts', roles: ['view', 'manage', 'cashier', 'owner', 'hq'] },
  { href: '/finance/payments', labelKey: 'finance.payments', roles: ['view', 'manage', 'cashier', 'owner', 'hq'] },
  { href: '/procurement/accountant-payments', labelKey: 'procurement.payments.accountantQueue', roles: ['manage', 'hq'] },
  { href: '/finance/income', labelKey: 'finance.income', roles: ['view', 'manage', 'owner', 'hq'] },
  { href: '/finance/expenses', labelKey: 'finance.expenses', roles: ['view', 'manage', 'owner', 'hq'] },
  { href: '/finance/transfers', labelKey: 'finance.transfers', roles: ['view', 'manage', 'owner', 'hq'] },
  { href: '/finance/investments', labelKey: 'finance.investments', roles: ['view', 'owner', 'hq'] },
  { href: '/finance/shifts', labelKey: 'finance.shifts', roles: ['view', 'manage', 'cashier', 'owner', 'hq'] },
  { href: '/finance/reconciliation', labelKey: 'finance.reconciliation', roles: ['view', 'manage', 'owner', 'hq'] },
  { href: '/finance/cash-flow', labelKey: 'finance.cashFlow', roles: ['view', 'manage', 'owner', 'hq'] },
  { href: '/finance/reports', labelKey: 'finance.reports', roles: ['view', 'owner', 'hq'] },
  { href: '/finance/audit', labelKey: 'finance.audit', roles: ['view', 'manage', 'owner', 'hq'] },
];

export const FINANCE_ACCOUNT_TYPE_TABS: ModuleSectionLink[] = [
  { href: '/finance/accounts', labelKey: 'finance.accountsAll' },
  { href: '/finance/accounts?type=CASH', labelKey: 'finance.accountsCash' },
  { href: '/finance/accounts?type=BANK', labelKey: 'finance.accountsBank' },
  { href: '/finance/accounts?type=QR', labelKey: 'finance.accountsQr' },
  { href: '/finance/accounts?type=POS', labelKey: 'finance.accountsPos' },
  { href: '/finance/accounts?type=OTHER', labelKey: 'finance.accountsOther' },
  { href: '/finance/accounts?status=INACTIVE', labelKey: 'finance.accountsInactive' },
];

export const FINANCE_PAYMENT_TABS: ModuleSectionLink[] = [
  { href: '/finance/payments/pending', labelKey: 'finance.pendingPayments' },
  { href: '/finance/payments', labelKey: 'finance.acceptedPayments' },
  { href: '/finance/payments?status=PARTIAL', labelKey: 'finance.partiallyPaid' },
];

export const FINANCE_TRANSFER_TABS: ModuleSectionLink[] = [
  { href: '/finance/transfers', labelKey: 'finance.transfersAll' },
  { href: '/finance/transfers?status=PENDING', labelKey: 'finance.transfersPending' },
  { href: '/finance/transfers?status=COMPLETED', labelKey: 'finance.transfersCompleted' },
  { href: '/finance/transfers?status=REJECTED', labelKey: 'finance.transfersRejected' },
];

export const FINANCE_SHIFT_TABS: ModuleSectionLink[] = [
  { href: '/finance/shifts?status=OPEN', labelKey: 'finance.openShifts' },
  { href: '/finance/shifts?status=CLOSED', labelKey: 'finance.closedShifts' },
  { href: '/finance/shifts?differences=1', labelKey: 'finance.shiftDifferences' },
];

export const FINANCE_RECONCILIATION_TABS: ModuleSectionLink[] = [
  { href: '/finance/reconciliation', labelKey: 'finance.reconciliationAll' },
  { href: '/finance/reconciliation?status=PENDING', labelKey: 'finance.reconciliationPending' },
  { href: '/finance/reconciliation?status=COMPLETED', labelKey: 'finance.reconciliationCompleted' },
  { href: '/finance/reconciliation?status=DIFFERENCE', labelKey: 'finance.reconciliationDifferences' },
];

export const FINANCE_REPORT_LINKS: ModuleSectionLink[] = [
  { href: '/finance/reports?type=account-balance', labelKey: 'finance.reportAccountBalance' },
  { href: '/finance/reports?type=daily-cash', labelKey: 'finance.reportDailyCash' },
  { href: '/finance/reports?type=cashier-shift', labelKey: 'finance.reportCashierShift' },
  { href: '/finance/reports?type=income', labelKey: 'finance.reportIncome' },
  { href: '/finance/reports?type=expense', labelKey: 'finance.reportExpense' },
  { href: '/finance/cash-flow', labelKey: 'finance.reportCashFlow' },
  { href: '/finance/reports?type=payments', labelKey: 'finance.reportPayments' },
  { href: '/finance/reports?type=transfers', labelKey: 'finance.reportTransfers' },
  { href: '/finance/reports?type=investments', labelKey: 'finance.reportInvestments' },
  { href: '/finance/reports?type=reconciliation', labelKey: 'finance.reportReconciliation' },
  { href: '/finance/reports?type=branch-summary', labelKey: 'finance.reportBranchSummary' },
  { href: '/finance/reports?type=hq-consolidated', labelKey: 'finance.reportHqConsolidated' },
];

function matchesFinanceRole(user: User, roles: FinanceNavSection['roles']) {
  if (hasCashierCapability(user)) return roles.includes('cashier');
  if (canManageFinanceAccounts(user)) return roles.includes('manage') || roles.includes('view');
  if (isHqFinanceUser(user)) return roles.includes('hq') || roles.includes('view');
  if (user.roles?.includes('FRANCHISE_OWNER') || user.role === 'FRANCHISE_OWNER') {
    return roles.includes('owner') || roles.includes('view');
  }
  return roles.includes('view');
}

export function isCashierOnlyFinanceUser(user: User | null | undefined) {
  if (!user) return false;
  return hasCashierCapability(user) && !canManageFinanceAccounts(user) && !isHqFinanceUser(user);
}

export function financeRootHrefForUser(user: User | null | undefined) {
  return isCashierOnlyFinanceUser(user) ? '/finance/payments/pending' : '/finance/dashboard';
}

export function visibleFinanceNavSections(user: User | null) {
  if (!user) return [];
  if (isCashierOnlyFinanceUser(user)) {
    return [];
  }
  return FINANCE_MAIN_NAV.filter((section) => matchesFinanceRole(user, section.roles));
}

const CASHIER_FINANCE_PATH_PREFIXES = ['/finance/accounts', '/finance/payments', '/finance/shifts'];

export function canAccessFinancePath(user: User, pathname: string) {
  if (!pathname.startsWith('/finance')) return true;
  if (isCashierOnlyFinanceUser(user)) {
    if (pathname === '/finance' || pathname === '/finance/') return true;
    if (pathname.match(/^\/finance\/accounts\/[^/]+$/) && !pathname.startsWith('/finance/accounts/new')) {
      return true;
    }
    return CASHIER_FINANCE_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  const sections = visibleFinanceNavSections(user);
  if (pathname === '/finance' || pathname === '/finance/') {
    return sections.length > 0;
  }
  if (pathname.startsWith('/finance/accounts/new') || pathname.match(/^\/finance\/accounts\/[^/]+$/)) {
    return sections.some((s) => s.href.startsWith('/finance/accounts'));
  }
  return sections.some((section) => pathname === section.href || pathname.startsWith(`${section.href}/`) || pathname.startsWith(section.href.split('?')[0]));
}
