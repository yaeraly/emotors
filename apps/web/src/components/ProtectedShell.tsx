'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { apiFetch, clearToken, getToken } from '@/lib/api';
import { fetchCurrentUser, getCachedUser } from '@/lib/current-user';
import type { FinanceAccount, User } from '@/lib/types';
import { canShowHqCashierAccountTransferMenu } from '@/lib/finance-account-visibility';
import { canAccessPath, canViewProcurement, canViewChinaReceivingMenu, canViewDistributionMenu, canViewHqWarehouse, canViewBranchWarehouses, canViewProductMaster, canViewPricing, canManageProductCatalog, canViewProductCatalog, canManageBranchPurchaseRequests, canManageOwnBranchProductRequest, canCreateServiceOrder, canViewBranchProductShortages, canViewBranchPurchaseRequests, getDefaultRouteForUser, hasFullAccess, hasPermission, isSupplyChainManagerUser, isWarehouseManagerUser, isHqSalesManagerUser, isHqCashierUser, isHqAccountantUser, isCeoUser, isFranchiseDirectorUser, isWarehouseManagerForbiddenPath, isBranchSalesManagerUser, isBranchSalesManagerForbiddenPath, isBranchWarehouseOperator, isBranchWarehouseOperatorForbiddenPath, isBranchWarehouseOperatorRequestsForbiddenPath, BRANCH_WAREHOUSE_OPERATOR_REQUESTS_REDIRECT, isBranchMasterUser, isBranchMasterInventoryForbiddenPath, isBranchCashierUser, isBranchCashierForbiddenPath, isBranchAccountantUser, isBranchAccountantForbiddenPath, isBranchOwnerUser, isBranchOwnerForbiddenPath, isBranchOwnerProcurementForbiddenPath, roleCodesForUser, isSysAdminUser } from '@/lib/rbac';
import { SYSADMIN_NAV_SECTIONS } from '@/lib/sysadmin-nav';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { isUnifiedNavModuleActive, sidebarHrefForModule, usesUnifiedNav, visibleUnifiedSidebarModules } from '@/lib/unified-nav';
import { sidebarFinanceNavClass, sidebarNavClass } from '@/lib/nav-matching';
import { UnifiedModuleTopNav } from './UnifiedModuleTopNav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { ForbiddenView } from './ForbiddenView';
import { useTranslation } from '@/i18n/useTranslation';

type ProtectedShellProps = {
  children: ReactNode;
};

function resolvePathAccess(currentUser: User, pathname: string): {
  forbidden: boolean;
  forbiddenReason: 'procurement' | null;
  redirectTo: string | null;
  auditForbidden: boolean;
} {
  if (currentUser.mustChangePassword && pathname !== '/change-password') {
    return { forbidden: false, forbiddenReason: null, redirectTo: '/change-password', auditForbidden: false };
  }

  if (
    (isBranchAccountantUser(currentUser) || isBranchOwnerUser(currentUser)) &&
    (pathname === '/finance/cash-flow' || pathname.startsWith('/finance/cash-flow/'))
  ) {
    return { forbidden: false, forbiddenReason: null, redirectTo: '/finance/transfers', auditForbidden: false };
  }

  if (isBranchMasterUser(currentUser) && isBranchMasterInventoryForbiddenPath(pathname)) {
    return { forbidden: false, forbiddenReason: null, redirectTo: '/service', auditForbidden: false };
  }

  if (isBranchWarehouseOperator(currentUser) && isBranchWarehouseOperatorRequestsForbiddenPath(pathname)) {
    return {
      forbidden: false,
      forbiddenReason: null,
      redirectTo: BRANCH_WAREHOUSE_OPERATOR_REQUESTS_REDIRECT,
      auditForbidden: false,
    };
  }

  if (canAccessPath(currentUser, pathname)) {
    return { forbidden: false, forbiddenReason: null, redirectTo: null, auditForbidden: false };
  }

  if (isWarehouseManagerUser(currentUser) && isWarehouseManagerForbiddenPath(pathname)) {
    return { forbidden: true, forbiddenReason: null, redirectTo: null, auditForbidden: false };
  }
  if (isBranchSalesManagerUser(currentUser) && isBranchSalesManagerForbiddenPath(pathname)) {
    return { forbidden: true, forbiddenReason: null, redirectTo: null, auditForbidden: true };
  }
  if (isBranchWarehouseOperator(currentUser) && isBranchWarehouseOperatorForbiddenPath(pathname)) {
    return { forbidden: true, forbiddenReason: null, redirectTo: null, auditForbidden: true };
  }
  if (isBranchCashierUser(currentUser) && isBranchCashierForbiddenPath(pathname)) {
    return { forbidden: true, forbiddenReason: null, redirectTo: null, auditForbidden: true };
  }
  if (isBranchAccountantUser(currentUser) && isBranchAccountantForbiddenPath(pathname)) {
    return { forbidden: true, forbiddenReason: null, redirectTo: null, auditForbidden: true };
  }
  if (isBranchOwnerUser(currentUser) && isBranchOwnerForbiddenPath(pathname)) {
    return {
      forbidden: true,
      forbiddenReason: isBranchOwnerProcurementForbiddenPath(pathname) ? 'procurement' : null,
      redirectTo: null,
      auditForbidden: true,
    };
  }

  return {
    forbidden: false,
    forbiddenReason: null,
    redirectTo: getDefaultRouteForUser(currentUser),
    auditForbidden: false,
  };
}

export function ProtectedShell({ children }: ProtectedShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [loading, setLoading] = useState(() => !getCachedUser());
  const [forbidden, setForbidden] = useState(false);
  const [forbiddenReason, setForbiddenReason] = useState<'procurement' | null>(null);
  const [hqCashierTransferMenuVisible, setHqCashierTransferMenuVisible] = useState(false);

  // Load session user once per browser session (cached). Never block navigation remounts on /auth/me.
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    const hasCache = Boolean(getCachedUser());
    if (!hasCache) {
      setLoading(true);
    }

    fetchCurrentUser()
      .then((currentUser) => {
        if (cancelled) return;
        setUser(currentUser);
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Path access checks are sync against the cached user — do not remount the shell via loading.
  useEffect(() => {
    if (!user) return;

    setForbidden(false);
    setForbiddenReason(null);

    const access = resolvePathAccess(user, pathname);
    if (access.redirectTo) {
      router.replace(access.redirectTo);
      return;
    }
    if (access.forbidden) {
      if (access.auditForbidden) {
        void apiFetch('/audit/forbidden-route', {
          method: 'POST',
          body: JSON.stringify({ pathname }),
        }).catch(() => null);
      }
      setForbiddenReason(access.forbiddenReason);
      setForbidden(true);
      return;
    }

    setForbidden(false);
    if (
      isBranchSalesManagerUser(user) &&
      typeof window !== 'undefined' &&
      !window.sessionStorage.getItem('bsm-menu-audit')
    ) {
      window.sessionStorage.setItem('bsm-menu-audit', '1');
      void apiFetch('/audit/branch-sales-manager-menu', { method: 'POST' }).catch(() => null);
    }
  }, [user, pathname, router]);

  useEffect(() => {
    if (!user || !isHqCashierUser(user)) {
      setHqCashierTransferMenuVisible(false);
      return;
    }

    let cancelled = false;
    void apiFetch<FinanceAccount[]>('/finance/accounts')
      .then((accounts) => {
        if (!cancelled) {
          setHqCashierTransferMenuVisible(canShowHqCashierAccountTransferMenu(accounts));
        }
      })
      .catch(() => {
        if (!cancelled) setHqCashierTransferMenuVisible(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    clearToken();
    router.replace('/login');
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        {t('common.loading')}
      </main>
    );
  }

  const canSeeCrm = hasPermission(user, 'crm.manage');
  const franchiseDirectorView = isFranchiseDirectorUser(user);
  const canSeeSales = hasPermission(user, 'sales.manage');
  const canSeeInventory =
    !isCeoUser(user) &&
    !franchiseDirectorView &&
    !isBranchMasterUser(user) &&
    (hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view') || canViewProductCatalog(user));
  const canManageInventory = hasPermission(user, 'inventory.manage');
  const canManageProducts = canManageProductCatalog(user);
  const canSeeService = hasPermission(user, 'service.manage');
  const canSeeHqWarehouse = canViewHqWarehouse(user);
  const canManageBranches = hasPermission(user, 'branches.manage');
  const canSeeKpi = hasPermission(user, 'kpi.view');
  const canSeeReports = hasPermission(user, 'reports.view') || hasPermission(user, 'analytics.view');
  const canManageUsers = hasPermission(user, 'users.manage');
  const canSeeAcademy = hasPermission(user, 'academy.manage');
  const canSeeMarketing = hasPermission(user, 'marketing.manage');
  const canSeeProcurement = canViewProcurement(user);
  const canManageProcurementOrders = hasPermission(user, 'procurement.manage');
  const canSeeDistribution = canViewDistributionMenu(user) && !franchiseDirectorView;
  const canManageDistribution = hasPermission(user, 'distribution.manage');
  const canSeeFinance = hasPermission(user, 'finance.view') && !franchiseDirectorView;
  const canSeeInvestment = hasFullAccess(user);
  const canSeeExpansion = hasFullAccess(user) || franchiseDirectorView;
  const canSeeRoyalty = hasPermission(user, 'branches.manage') && !franchiseDirectorView;
  const canSeeTax = hasPermission(user, 'finance.view') && !franchiseDirectorView;
  const canSeeAi = hasPermission(user, 'reports.view') || hasPermission(user, 'analytics.view');
  const canSeePayroll = hasPermission(user, 'payroll.manage');
  const canSeePayments = hasPermission(user, 'payments.manage');
  const canSeeReservations = hasPermission(user, 'sales.manage');
  const canSeeReturns = hasPermission(user, 'sales.manage') || hasPermission(user, 'payments.manage');
  const canSeeWarehouseRelease = hasPermission(user, 'inventory.manage') || hasPermission(user, 'sales.manage');
  const canSeeWarrantyClaims = hasPermission(user, 'service.manage') || hasPermission(user, 'distribution.manage');
  const canSeeSupplierClaims = hasPermission(user, 'procurement.manage') || hasPermission(user, 'distribution.manage');
  const canCreateService = canCreateServiceOrder(user);
  const roleLabel = roleCodesForUser(user).join(', ');
  const supplyChainManagerView = isSupplyChainManagerUser(user);
  const canSeeBranchProductShortages = canViewBranchProductShortages(user);
  const ceoOperationalView = isCeoUser(user);
  const warehouseManagerView = isWarehouseManagerUser(user);
  const hqSalesManagerView = isHqSalesManagerUser(user);
  const hqCashierView = isHqCashierUser(user);
  const hqAccountantView = isHqAccountantUser(user);
  const branchSalesManagerView = isBranchSalesManagerUser(user);
  const branchMasterView = isBranchMasterUser(user);
  const branchCashierView = isBranchCashierUser(user);
  const branchAccountantView = isBranchAccountantUser(user);
  const branchWarehouseOperatorView = isBranchWarehouseOperator(user);
  const branchOwnerView = isBranchOwnerUser(user);
  const sysAdminView = isSysAdminUser(user);
  const unifiedNavView = usesUnifiedNav(user);
  const unifiedSidebarModules = visibleUnifiedSidebarModules(user);
  const forbiddenMessage =
    forbiddenReason === 'procurement' ? t('errors.procurementAccessDenied') : undefined;
  const canSeeBranchWarehouses = canViewBranchWarehouses(user);
  const canSeeProductMaster = canViewProductMaster(user);
  const canSeePricing = canViewPricing(user);

  if (forbidden) {
    return (
      <div className="min-h-screen bg-slate-100">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">{t('app.name')}</p>
              <h1 className="text-xl font-bold text-slate-950">{t('app.name')}</h1>
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell user={user} />
              <LanguageSwitcher />
              <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button">
                {t('common.logout')}
              </button>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6">
          <ForbiddenView message={forbiddenMessage} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">
              {t('app.name')}
            </p>
            <h1 className="text-xl font-bold text-slate-950">
              {t('app.name')}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell user={user} />
            <LanguageSwitcher />
            <div className="text-right text-sm">
              <p className="font-semibold text-slate-900">{user.fullName}</p>
              <p className="text-slate-500">
                {roleLabel} · {user.branch?.name ?? 'HQ'}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              type="button"
            >
              {t('common.logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {t('nav.modules')}
          </p>
          <nav className="space-y-2">
            {sysAdminView ? (
              <>
                {SYSADMIN_NAV_SECTIONS.map((section) => (
                  <div key={section.titleKey} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                    <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                      {t(section.titleKey)}
                    </p>
                    <div className="space-y-1">
                      {section.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={sidebarNavClass(pathname, link.href)}
                        >
                          {link.labelKey ? t(link.labelKey) : link.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : supplyChainManagerView || ceoOperationalView ? (
              <>
                {canSeeHqWarehouse ? (
                  <Link href="/hq-warehouses" className={sidebarNavClass(pathname, '/hq-warehouses')}>{t('scm.sidebar.hqWarehouses')}</Link>
                ) : null}
                {canSeeBranchWarehouses ? (
                  <Link href="/branch-warehouses" className={sidebarNavClass(pathname, '/branch-warehouses')}>{t('scm.sidebar.branchWarehouses')}</Link>
                ) : null}
                {canSeeProductMaster ? (
                  <Link href="/product-master" className={sidebarNavClass(pathname, '/product-master')}>{t('scm.sidebar.productMaster')}</Link>
                ) : null}
                {canSeePricing ? (
                  <Link href="/pricing" className={sidebarNavClass(pathname, '/pricing')}>{t('pricing.title')}</Link>
                ) : null}
                {canSeeProcurement ? (
                  <Link href="/procurement" className={sidebarNavClass(pathname, '/procurement')}>{t('scm.sidebar.procurement')}</Link>
                ) : null}
                {canSeeDistribution ? (
                  <Link href="/distribution/orders" className={sidebarNavClass(pathname, '/distribution/orders')}>{t('nav.supplyBranchFulfillment')}</Link>
                ) : null}
                {ceoOperationalView && canViewBranchPurchaseRequests(user) ? (
                  <Link href="/branch-purchase-requests" className={sidebarNavClass(pathname, '/branch-purchase-requests')}>{t('nav.hqBranchOrders')}</Link>
                ) : null}
                {canSeeBranchProductShortages ? (
                  <Link href="/branch-product-shortages" className={sidebarNavClass(pathname, '/branch-product-shortages')}>{t('productShortages.title')}</Link>
                ) : null}
                {ceoOperationalView ? (
                  <div className="border-t border-slate-100 pt-2">
                    <Link href="/hq-sales/installment-requests" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      Рассрочка HQ Sales (CEO)
                    </Link>
                    {canManageUsers ? <Link href="/users" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.users')}</Link> : null}
                    {canManageBranches ? <Link href="/branches" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.branches')}</Link> : null}
                    {canSeeFinance ? <Link href="/finance" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.finance')}</Link> : null}
                    {canSeeService ? (
                      <div className="rounded-xl px-3 py-2">
                        <Link href="/service" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">{t('service.title')}</Link>
                        <div className="mt-2 space-y-1 pl-2">
                          <Link href="/service/warranties" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('service.warranties')}</Link>
                          <Link href="/service/reports" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('nav.reports')}</Link>
                        </div>
                      </div>
                    ) : null}
                    {canSeeKpi ? <Link href="/kpi" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.kpi')}</Link> : null}
                    {canSeeReports ? <Link href="/analytics" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.analytics')}</Link> : null}
                    {canSeeAcademy ? <Link href="/academy" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.academy')}</Link> : null}
                    {canSeeMarketing ? <Link href="/marketing" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.marketing')}</Link> : null}
                  </div>
                ) : null}
              </>
            ) : hqSalesManagerView ? (
              <>
                <Link href="/hq-sales/sales" className={sidebarNavClass(pathname, '/hq-sales/sales')}>
                  Продажи (Дилер / Дистрибьютер)
                </Link>
                <Link href="/branch-purchase-requests" className={sidebarNavClass(pathname, '/branch-purchase-requests')}>{t('nav.hqBranchOrders')}</Link>
                <Link href="/branches" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.branches')}</Link>
                {canSeeBranchWarehouses ? (
                  <Link href="/branch-warehouses" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.branchWarehouses')}</Link>
                ) : null}
                {canSeeProductMaster ? (
                  <Link href="/product-master" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.productMaster')}</Link>
                ) : null}
              </>
            ) : hqCashierView ? (
              <>
                <Link href="/finance/cashier-bills" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('finance.cashierBills')}</Link>
                <Link href="/finance/accounts" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('finance.myAccounts')}</Link>
                {hqCashierTransferMenuVisible ? (
                  <Link href="/finance/transfers" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {t('branchCashier.accountTransfers')}
                  </Link>
                ) : null}
                <Link href="/distribution/orders" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.orders')}</Link>
              </>
            ) : hqAccountantView ? (
              <>
                <Link href="/hq-accountant/payment-confirmations" className={sidebarNavClass(pathname, '/hq-accountant/payment-confirmations')}>
                  Подтверждение платежей (HQ Sales)
                </Link>
                <Link href="/finance/bills-to-pay" className={sidebarNavClass(pathname, '/finance/bills-to-pay')}>
                  {t('finance.billsToPay')}
                </Link>
                <Link href="/finance/dashboard" className={sidebarNavClass(pathname, '/finance/dashboard')}>
                  {t('nav.finance')}
                </Link>
                <Link href="/tax" className={sidebarNavClass(pathname, '/tax')}>
                  {t('tax.title')}
                </Link>
                <Link href="/payroll" className={sidebarNavClass(pathname, '/payroll')}>
                  {t('payroll.title')}
                </Link>
                <Link href="/commissions" className={sidebarNavClass(pathname, '/commissions')}>
                  {t('commissions.title')}
                </Link>
                <Link href="/compensation/rules" className={sidebarNavClass(pathname, '/compensation/rules')}>
                  {t('compensation.rules')}
                </Link>
              </>
            ) : warehouseManagerView ? (
              <>
                {canSeeHqWarehouse ? (
                  <Link href="/hq-warehouses" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.hqWarehouses')}</Link>
                ) : null}
                {canViewChinaReceivingMenu(user) ? (
                  <Link href="/hq-warehouses/china-receiving" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('chinaReceiving.title')}</Link>
                ) : null}
                <Link href="/distribution/orders" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t(distributionModuleTitleKey(user))}</Link>
              </>
            ) : franchiseDirectorView ? (
              <>
                <Link href="/franchise-director" className={sidebarNavClass(pathname, '/franchise-director')}>{t('franchiseDirector.dashboard')}</Link>
                <Link href="/franchise-director/branches" className={sidebarNavClass(pathname, '/franchise-director/branches')}>{t('franchiseDirector.branches')}</Link>
                <Link href="/franchise-director/performance" className={sidebarNavClass(pathname, '/franchise-director/performance')}>{t('franchiseDirector.performance')}</Link>
                <Link href="/franchise-director/monitoring" className={sidebarNavClass(pathname, '/franchise-director/monitoring')}>{t('franchiseDirector.monitoring')}</Link>
                <Link href="/franchise-director/expansion" className={sidebarNavClass(pathname, '/franchise-director/expansion')}>{t('franchiseDirector.expansion')}</Link>
                <Link href="/franchise-director/support" className={sidebarNavClass(pathname, '/franchise-director/support')}>{t('franchiseDirector.support')}</Link>
                <Link href="/franchise-director/academy" className={sidebarNavClass(pathname, '/franchise-director/academy')}>{t('franchiseDirector.academy')}</Link>
                <Link href="/franchise-director/marketing" className={sidebarNavClass(pathname, '/franchise-director/marketing')}>{t('franchiseDirector.marketing')}</Link>
                <Link href="/franchise-director/supply" className={sidebarNavClass(pathname, '/franchise-director/supply')}>{t('franchiseDirector.supply')}</Link>
                <Link href="/franchise-director/finance" className={sidebarNavClass(pathname, '/franchise-director/finance')}>{t('franchiseDirector.finance')}</Link>
                <Link href="/franchise-director/reports" className={sidebarNavClass(pathname, '/franchise-director/reports')}>{t('franchiseDirector.reports')}</Link>
                <Link href="/franchise-director/notifications" className={sidebarNavClass(pathname, '/franchise-director/notifications')}>{t('franchiseDirector.notifications')}</Link>
                <Link href="/kpi" className={sidebarNavClass(pathname, '/kpi')}>{t('nav.kpi')}</Link>
                <Link href="/academy" className={sidebarNavClass(pathname, '/academy')}>{t('nav.academy')}</Link>
              </>
            ) : branchWarehouseOperatorView ? (
              <>
                <Link href="/branch-warehouse/warehouse" className={sidebarNavClass(pathname, '/branch-warehouse/warehouse')}>{t('branchWarehouseOperator.warehouse')}</Link>
                <Link href="/distribution/orders?status=SHIPPED" className={sidebarNavClass(pathname, '/distribution/orders')}>{t('distribution.receiveGoods')}</Link>
                <Link href="/distribution/shortage-reports" className={sidebarNavClass(pathname, '/distribution/shortage-reports')}>{t('distribution.shortageReports')}</Link>
              </>
            ) : branchAccountantView ? (
              <>
                <Link href="/finance/dashboard" className={sidebarFinanceNavClass(pathname)}>
                  {t('nav.finance')}
                </Link>
                <Link href="/branch-accountant/invoices" className={sidebarNavClass(pathname, '/branch-accountant/invoices')}>
                  {t('branchAccountant.invoicesToPay')}
                </Link>
                <Link href="/branch-accountant/transfers" className={sidebarNavClass(pathname, '/branch-accountant/transfers')}>
                  {t('branchAccountant.accountTransfersReview')}
                </Link>
                <Link href="/tax" className={sidebarNavClass(pathname, '/tax')}>
                  {t('tax.title')}
                </Link>
                <Link href="/payroll" className={sidebarNavClass(pathname, '/payroll')}>
                  {t('payroll.title')}
                </Link>
                <Link href="/commissions" className={sidebarNavClass(pathname, '/commissions')}>
                  {t('commissions.title')}
                </Link>
                <Link href="/compensation/rules" className={sidebarNavClass(pathname, '/compensation/rules')}>
                  {t('compensation.rules')}
                </Link>
              </>
            ) : branchCashierView ? (
              <>
                <Link href="/finance/accounts" className={sidebarNavClass(pathname, '/finance/accounts')}>
                  {t('finance.myAccounts')}
                </Link>
                <Link href="/branch-cashier/invoices" className={sidebarNavClass(pathname, '/branch-cashier/invoices')}>
                  {t('branchCashier.invoicesToPay')}
                </Link>
                <Link href="/branch-cashier/installments" className={sidebarNavClass(pathname, '/branch-cashier/installments')}>
                  {t('branchCashier.installments')}
                </Link>
                <Link href="/branch-cashier/transfers" className={sidebarNavClass(pathname, '/branch-cashier/transfers')}>
                  {t('branchCashier.accountTransfers')}
                </Link>
                <Link href="/service/cashier" className={sidebarNavClass(pathname, '/service/cashier')}>
                  {t('branchCashier.servicePayment')}
                </Link>
                <Link href="/returns" className={sidebarNavClass(pathname, '/returns')}>
                  {t('operations.returns')}
                </Link>
              </>
            ) : branchMasterView ? (
              <>
                {canSeeCrm ? (
                  <Link href="/customers" className={sidebarNavClass(pathname, '/customers')}>
                    {t('nav.customers')}
                  </Link>
                ) : null}
                <Link href="/service" className={sidebarNavClass(pathname, '/service')}>
                  {t('service.title')}
                </Link>
                <Link href="/service/kpi" className={sidebarNavClass(pathname, '/service/kpi')}>
                  KPI
                </Link>
              </>
            ) : branchSalesManagerView ? (
              <>
                {unifiedSidebarModules.map((module) => {
                  const active = isUnifiedNavModuleActive(pathname, module);
                  const href = sidebarHrefForModule(module, user!);
                  return (
                    <Link
                      key={module.id}
                      href={href}
                      className={
                        active
                          ? 'block rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700'
                          : 'block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
                      }
                    >
                      {t(module.labelKey)}
                    </Link>
                  );
                })}
              </>
            ) : branchOwnerView ? (
              <>
                {unifiedSidebarModules.map((module) => {
                  const active = isUnifiedNavModuleActive(pathname, module);
                  const href = sidebarHrefForModule(module, user!);
                  return (
                    <Link
                      key={module.id}
                      href={href}
                      className={
                        active
                          ? 'block rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700'
                          : 'block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
                      }
                    >
                      {t(module.labelKey)}
                    </Link>
                  );
                })}
              </>
            ) : (
              <>
            {canSeeCrm ? (
              <Link
                href="/customers"
                className={sidebarNavClass(pathname, '/customers')}
              >
                {t('nav.customers')}
              </Link>
            ) : null}
            {canSeeSales ? (
              <Link
                href="/sales"
                className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('nav.sales')}
              </Link>
            ) : null}
            {canSeeReservations ? <Link href="/reservations" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('operations.reservations')}</Link> : null}
            {canSeeReturns ? <Link href="/returns" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('operations.returns')}</Link> : null}
            {canSeeInventory ? (
              <div className="rounded-xl px-3 py-2">
                <Link
                  href="/inventory"
                  className="block text-sm font-semibold text-slate-700 hover:text-blue-700"
                >
                  {t('nav.inventory')}
                </Link>
                <div className="mt-2 space-y-1 pl-2">
                  <Link href="/products" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('inventory.products')}
                  </Link>
                  {canManageInventory ? (
                    <Link href="/stock-movements" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('inventory.stockMovements')}
                    </Link>
                  ) : null}
                  {canSeeWarehouseRelease ? (
                    <Link href="/warehouse-release" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('operations.warehouseRelease')}
                    </Link>
                  ) : null}
                  <Link href="/warehouses" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('inventory.warehouses')}
                  </Link>
                  {canManageProducts ? (
                    <Link href="/inventory/categories" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('inventory.categories')}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            {canSeeService ? (
              <div className="rounded-xl px-3 py-2">
                <Link href="/service" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">{t('service.title')}</Link>
                <div className="mt-2 space-y-1 pl-2">
                  {canCreateService ? (
                    <Link href="/service/new" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('service.newOrder')}</Link>
                  ) : null}
                  <Link href="/service/warranties" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('service.warranties')}</Link>
                  <Link href="/service/reports" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('nav.reports')}</Link>
                  {canSeeWarrantyClaims ? <Link href="/warranty/claims" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('operations.warrantyClaims')}</Link> : null}
                  {canSeeService ? <Link href="/service/parts-requests" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('operations.partsRequests')}</Link> : null}
                </div>
              </div>
            ) : null}
            <div className="border-t border-slate-100 pt-2">
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('phase2.title')}
              </p>
              {canSeeHqWarehouse ? (
                <Link href="/hq-warehouses" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.hqWarehouse')}</Link>
              ) : null}
              {canManageBranches ? <Link href="/branches" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.branches')}</Link> : null}
              {canSeeKpi ? <Link href="/kpi" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.kpi')}</Link> : null}
              {canSeeReports ? <Link href="/analytics" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.analytics')}</Link> : null}
              {canSeeRoyalty ? <Link href="/royalty" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.royalty')}</Link> : null}
              {canSeeAcademy ? <Link href="/academy" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.academy')}</Link> : null}
              {canSeeMarketing ? <Link href="/marketing" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.marketing')}</Link> : null}
              {canSeeDistribution ? (
                <div className="rounded-xl px-3 py-2">
                  <Link href="/distribution/orders" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">{t(distributionModuleTitleKey(user))}</Link>
                  <div className="mt-2 space-y-1 pl-2">
                    <Link href="/distribution/orders" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.orders')}</Link>
                    {canManageDistribution ? (
                      <Link href="/distribution/orders/new" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.newOrder')}</Link>
                    ) : null}
                    <Link href="/distribution/receivings" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.receiveGoods')}</Link>
                    <Link href="/distribution/shortage-reports" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.shortageReports')}</Link>
                    <Link href="/distribution/invoices" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.invoices')}</Link>
                    <Link href="/distribution/branch-balances" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.branchBalances')}</Link>
                  </div>
                </div>
              ) : null}
              {canSeeProcurement ? (
                <Link href="/procurement" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('procurement.title')}</Link>
              ) : null}
              {canManageBranchPurchaseRequests(user) ? (
                <Link href="/branch-purchase-requests" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('operations.branchPurchaseRequests')}</Link>
              ) : null}
              {canSeeProcurement && canSeeSupplierClaims ? (
                <Link href="/supplier-claims" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('operations.supplierClaims')}</Link>
              ) : null}
              {!canSeeProcurement && (canSeeCrm || canSeeSales) ? <Link href="/branch-purchase-requests" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('operations.branchPurchaseRequests')}</Link> : null}
              {canSeeInvestment ? <Link href="/investment" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('investment.title')}</Link> : null}
              {canSeeExpansion ? <Link href="/expansion" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('expansion.title')}</Link> : null}
              {canSeeFinance ? <Link href="/finance" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.finance')}</Link> : null}
              {canSeeTax ? <Link href="/tax" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('tax.title')}</Link> : null}
              {canSeePayments ? <Link href="/payments" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.payments')}</Link> : null}
              {canSeeAi ? <Link href="/ai" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('ai.title')}</Link> : null}
              {canSeePayroll ? <Link href="/compensation/rules" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('compensation.rules')}</Link> : null}
              {canSeePayroll ? <Link href="/commissions" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('commissions.title')}</Link> : null}
              {canSeePayroll ? <Link href="/payroll" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('payroll.title')}</Link> : null}
              {canManageUsers ? <Link href="/users" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.users')}</Link> : null}
              {[
                'nav.dashboard',
                'nav.finance',
                'nav.reports',
                'nav.users',
                'nav.settings',
              ].map((key) => (
                <p
                  key={key}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-400"
                >
                  {t(key)}
                </p>
              ))}
            </div>
              </>
            )}
          </nav>
        </aside>

        <main>
          {unifiedNavView ? <UnifiedModuleTopNav user={user} /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
