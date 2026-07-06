'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { apiFetch, clearToken, getToken } from '@/lib/api';
import type { User } from '@/lib/types';
import { canAccessPath, canViewProcurement, canViewChinaReceiving, canViewHqWarehouse, canViewBranchWarehouses, canViewProductMaster, canManageProductCatalog, canViewProductCatalog, canViewDistribution, canManageBranchPurchaseRequests, canCreateServiceOrder, getDefaultRouteForUser, hasFullAccess, hasPermission, isSupplyChainManagerUser, isWarehouseManagerUser, isHqSalesManagerUser, isHqCashierUser, isCeoUser, isWarehouseManagerForbiddenPath, roleCodesForUser } from '@/lib/rbac';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { ForbiddenView } from './ForbiddenView';
import { useTranslation } from '@/i18n/useTranslation';

type ProtectedShellProps = {
  children: ReactNode;
};

export function ProtectedShell({ children }: ProtectedShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    apiFetch<User>('/auth/me')
      .then((currentUser) => {
        if (currentUser.mustChangePassword && pathname !== '/change-password') {
          router.replace('/change-password');
          return;
        }
        if (!canAccessPath(currentUser, pathname)) {
          if (isWarehouseManagerUser(currentUser) && isWarehouseManagerForbiddenPath(pathname)) {
            setUser(currentUser);
            setForbidden(true);
            return;
          }
          router.replace(getDefaultRouteForUser(currentUser));
          return;
        }
        setForbidden(false);
        setUser(currentUser);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [pathname, router]);

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    clearToken();
    router.replace('/login');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        {t('common.loading')}
      </main>
    );
  }

  const canSeeCrm = hasPermission(user, 'crm.manage');
  const canSeeSales = hasPermission(user, 'sales.manage');
  const canSeeInventory = !isCeoUser(user) && (hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view') || canViewProductCatalog(user));
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
  const canSeeDistribution = canViewDistribution(user);
  const canManageDistribution = hasPermission(user, 'distribution.manage');
  const canSeeFinance = hasPermission(user, 'finance.view');
  const canSeeInvestment = hasFullAccess(user);
  const canSeeExpansion = hasFullAccess(user);
  const canSeeRoyalty = hasPermission(user, 'branches.manage');
  const canSeeTax = hasPermission(user, 'finance.view');
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
  const ceoOperationalView = isCeoUser(user);
  const warehouseManagerView = isWarehouseManagerUser(user);
  const hqSalesManagerView = isHqSalesManagerUser(user);
  const hqCashierView = isHqCashierUser(user);
  const canSeeBranchWarehouses = canViewBranchWarehouses(user);
  const canSeeProductMaster = canViewProductMaster(user);

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
              <NotificationBell />
              <LanguageSwitcher />
              <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button">
                {t('common.logout')}
              </button>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6">
          <ForbiddenView />
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
            <NotificationBell />
            <LanguageSwitcher />
            <div className="text-right text-sm">
              <p className="font-semibold text-slate-900">{user?.fullName}</p>
              <p className="text-slate-500">
                {roleLabel} · {user?.branch?.name ?? 'HQ'}
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
            {supplyChainManagerView || ceoOperationalView ? (
              <>
                {canSeeHqWarehouse ? (
                  <Link href="/hq-warehouses" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.hqWarehouses')}</Link>
                ) : null}
                {canViewChinaReceiving(user) ? (
                  <Link href="/hq-warehouses/china-receiving" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('chinaReceiving.title')}</Link>
                ) : null}
                {canSeeBranchWarehouses ? (
                  <Link href="/branch-warehouses" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.branchWarehouses')}</Link>
                ) : null}
                {canSeeProductMaster ? (
                  <Link href="/product-master" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.productMaster')}</Link>
                ) : null}
                {canSeeProcurement ? (
                  <Link href="/procurement" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.procurement')}</Link>
                ) : null}
                {canSeeDistribution ? (
                  <Link href="/distribution/orders" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.title')}</Link>
                ) : null}
                {ceoOperationalView ? (
                  <div className="border-t border-slate-100 pt-2">
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
                <Link href="/distribution/orders" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.orders')}</Link>
                <Link href="/branch-purchase-requests" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('operations.branchPurchaseRequests')}</Link>
                <Link href="/distribution/invoices" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.invoices')}</Link>
                {canSeeBranchWarehouses ? (
                  <Link href="/branch-warehouses" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.branchWarehouses')}</Link>
                ) : null}
                {canSeeProductMaster ? (
                  <Link href="/product-master" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.productMaster')}</Link>
                ) : null}
              </>
            ) : hqCashierView ? (
              <>
                <Link href="/distribution/invoices" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.invoices')}</Link>
                <Link href="/distribution/branch-balances" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.branchBalances')}</Link>
                <Link href="/distribution/orders" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.orders')}</Link>
              </>
            ) : warehouseManagerView ? (
              <>
                {canSeeHqWarehouse ? (
                  <Link href="/hq-warehouses" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('scm.sidebar.hqWarehouses')}</Link>
                ) : null}
                {canViewChinaReceiving(user) ? (
                  <Link href="/hq-warehouses/china-receiving" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('chinaReceiving.title')}</Link>
                ) : null}
                <Link href="/stock-movements" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('inventory.stockMovements')}</Link>
                <Link href="/distribution/orders" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('distribution.title')}</Link>
              </>
            ) : (
              <>
            {canSeeCrm ? (
              <Link
                href="/customers"
                className="block rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
              >
                {t('nav.customers')}
              </Link>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {t('nav.noCrmAccess')}
              </p>
            )}
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
                  <Link href="/distribution/orders" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">{t('distribution.title')}</Link>
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

        <main>{children}</main>
      </div>
    </div>
  );
}
