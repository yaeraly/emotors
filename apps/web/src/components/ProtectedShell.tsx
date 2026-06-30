'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { apiFetch, clearToken, getToken } from '@/lib/api';
import type { User } from '@/lib/types';
import {
  canAccessPath,
  canCreateProduct,
  canViewProductCatalog,
  getDefaultRouteForUser,
  hasAnyPermission,
  hasPermission,
  hasRole,
  roleCodesForUser,
} from '@/lib/rbac';
import { LanguageSwitcher } from './LanguageSwitcher';
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
          router.replace('/forbidden');
          return;
        }
        setUser(currentUser);
        setLoading(false);
      })
      .catch(() => router.replace('/login'));
  }, [pathname, router]);

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
  const canSeeSales = hasPermission(user, 'sales.manage');
  const canSeeInventory = hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view');
  const canSeeProductCatalog = canViewProductCatalog(user);
  const canCreateProducts = canCreateProduct(user);
  const canManageInventory = hasPermission(user, 'inventory.manage');
  const canManageProductCatalogNav = canCreateProducts;
  const canSeeService = hasPermission(user, 'service.manage');
  const canManageBranches = hasPermission(user, 'branches.manage');
  const canSeeKpi = hasPermission(user, 'kpi.view');
  const canSeeReports = hasPermission(user, 'reports.view') || hasPermission(user, 'analytics.view');
  const canManageUsers = hasPermission(user, 'users.manage');
  const canManageRoles = hasPermission(user, 'roles.manage');
  const canSeeAudit = hasPermission(user, 'audit.view');
  const canSeeSettings = hasPermission(user, 'settings.manage');
  const canSeeAcademy = hasPermission(user, 'academy.manage');
  const canSeeMarketing =
    hasPermission(user, 'marketing.manage') || hasPermission(user, 'marketing.content');
  const canSeeProcurement =
    hasPermission(user, 'procurement.manage') || hasPermission(user, 'procurement.landed_cost.view');
  const canSeeSupplyChain = hasPermission(user, 'distribution.manage');
  const canSeeDistribution = canSeeSupplyChain;
  const canSeeInvestment =
    hasRole(user, 'CEO') || hasRole(user, 'OWNER') || hasRole(user, 'INVESTMENT_MANAGER');
  const canSeeExpansion =
    hasRole(user, 'CEO') ||
    hasRole(user, 'OWNER') ||
    hasRole(user, 'EXPANSION_MANAGER') ||
    hasRole(user, 'FRANCHISE_DIRECTOR');
  const canSeeTax = hasPermission(user, 'finance.view');
  const canSeeFinanceCenter = hasPermission(user, 'finance.view');
  const canSeeAi = hasPermission(user, 'analytics.view') || hasPermission(user, 'reports.view');
  const canSeePayroll = hasPermission(user, 'payroll.manage');
  const canSeePayments = hasPermission(user, 'payments.manage') || hasRole(user, 'SALESPERSON');
  const canSeeReservations = hasPermission(user, 'sales.manage');
  const canSeeReturns = hasPermission(user, 'sales.manage') || hasPermission(user, 'payments.manage');
  const canSeeWarehouseRelease = hasPermission(user, 'inventory.manage') || hasPermission(user, 'sales.manage');
  const canSeeWarrantyClaims = hasPermission(user, 'service.manage') || hasPermission(user, 'distribution.manage');
  const canSeeSupplierClaims = hasPermission(user, 'procurement.manage') || hasPermission(user, 'distribution.manage');
  const canSeeAlerts = hasAnyPermission(user, [
    'crm.manage',
    'sales.manage',
    'inventory.manage',
    'procurement.manage',
    'distribution.manage',
    'finance.view',
  ]);
  const roleLabel = roleCodesForUser(user).join(', ');

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">
              {t('app.name')}
            </p>
            <h1 className="text-xl font-bold text-slate-950">{t('app.name')}</h1>
          </div>
          <div className="flex items-center gap-4">
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
            <Link
              href={getDefaultRouteForUser(user)}
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t('nav.dashboard')}
            </Link>

            {canSeeCrm ? (
              <Link
                href="/customers"
                className="block rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700"
              >
                {t('nav.customers')}
              </Link>
            ) : null}
            {canSeeSales ? (
              <Link href="/sales" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {t('nav.sales')}
              </Link>
            ) : null}
            {canSeeReservations ? (
              <Link href="/reservations" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {t('operations.reservations')}
              </Link>
            ) : null}
            {canSeeReturns ? (
              <Link href="/returns" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {t('operations.returns')}
              </Link>
            ) : null}
            {(canSeeInventory || canSeeProductCatalog) ? (
              <div className="rounded-xl px-3 py-2">
                {canSeeInventory ? (
                  <Link href="/inventory" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">
                    {t('nav.inventory')}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-slate-700">Product Catalog</p>
                )}
                <div className="mt-2 space-y-1 pl-2">
                  {canSeeProductCatalog ? (
                    <Link href="/products" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('inventory.products')}
                    </Link>
                  ) : null}
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
                  {canSeeInventory ? (
                    <Link href="/warehouses" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('inventory.warehouses')}
                    </Link>
                  ) : null}
                  {canManageProductCatalogNav ? (
                    <Link href="/inventory/categories" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('inventory.categories')}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            {canSeeService ? (
              <div className="rounded-xl px-3 py-2">
                <Link href="/service" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">
                  {t('service.title')}
                </Link>
                <div className="mt-2 space-y-1 pl-2">
                  <Link href="/service/new" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('service.newOrder')}
                  </Link>
                  <Link href="/service/warranties" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('service.warranties')}
                  </Link>
                  <Link href="/service/reports" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('nav.reports')}
                  </Link>
                  {canSeeWarrantyClaims ? (
                    <Link href="/warranty/claims" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('operations.warrantyClaims')}
                    </Link>
                  ) : null}
                  <Link href="/service/parts-requests" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('operations.partsRequests')}
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="border-t border-slate-100 pt-2">
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('phase2.title')}
              </p>
              {canManageBranches ? (
                <Link href="/branches" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.branches')}
                </Link>
              ) : null}
              {canSeeKpi ? (
                <Link href="/kpi" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.kpi')}
                </Link>
              ) : null}
              {canSeeReports ? (
                <Link href="/analytics" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.analytics')}
                </Link>
              ) : null}
              {canManageBranches ? (
                <Link href="/royalty" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.royalty')}
                </Link>
              ) : null}
              {canSeeAcademy ? (
                <Link href="/academy" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.academy')}
                </Link>
              ) : null}
              {canSeeMarketing ? (
                <Link href="/marketing" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.marketing')}
                </Link>
              ) : null}
              {canSeeDistribution ? (
                <div className="rounded-xl px-3 py-2">
                  <Link href="/distribution/orders" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">
                    {t('distribution.title')}
                  </Link>
                  <div className="mt-2 space-y-1 pl-2">
                    <Link href="/distribution/orders" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('distribution.orders')}
                    </Link>
                    <Link href="/distribution/receivings" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('distribution.receiveGoods')}
                    </Link>
                    <Link href="/distribution/shortage-reports" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('distribution.shortageReports')}
                    </Link>
                    {canSeeFinanceCenter ? (
                      <Link href="/distribution/invoices" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                        {t('distribution.invoices')}
                      </Link>
                    ) : null}
                    {canSeeFinanceCenter ? (
                      <Link href="/distribution/branch-balances" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                        {t('distribution.branchBalances')}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {canSeeProcurement ? (
                <div className="rounded-xl px-3 py-2">
                  <Link href="/procurement" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">
                    {t('procurement.title')}
                  </Link>
                  <div className="mt-2 space-y-1 pl-2">
                    {hasPermission(user, 'procurement.manage') ? (
                      <>
                        <Link href="/procurement/suppliers" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                          {t('procurement.suppliers')}
                        </Link>
                        <Link href="/procurement/factories" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                          {t('procurement.factories')}
                        </Link>
                      </>
                    ) : null}
                    <Link href="/procurement/orders" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                      {t('procurement.orders')}
                    </Link>
                    {hasPermission(user, 'procurement.manage') ? (
                      <Link href="/branch-purchase-requests" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                        {t('operations.branchPurchaseRequests')}
                      </Link>
                    ) : null}
                    {canSeeSupplierClaims ? (
                      <Link href="/supplier-claims" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                        {t('operations.supplierClaims')}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {!canSeeProcurement && (canSeeCrm || canSeeSales) ? (
                <Link href="/branch-purchase-requests" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('operations.branchPurchaseRequests')}
                </Link>
              ) : null}
              {canSeeSupplyChain ? (
                <Link href="/supply-chain" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('supplyChain.title')}
                </Link>
              ) : null}
              {canSeeInvestment ? (
                <Link href="/investment" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('investment.title')}
                </Link>
              ) : null}
              {canSeeExpansion ? (
                <Link href="/expansion" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('expansion.title')}
                </Link>
              ) : null}
              {canSeeTax ? (
                <Link href="/tax" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('tax.title')}
                </Link>
              ) : null}
              {canSeeFinanceCenter ? (
                <Link href="/finance" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.finance')}
                </Link>
              ) : null}
              {canSeePayments ? (
                <Link href="/payments" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Payments
                </Link>
              ) : null}
              {canSeeAi ? (
                <Link href="/ai" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('ai.title')}
                </Link>
              ) : null}
              {canSeePayroll ? (
                <Link href="/compensation/rules" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('compensation.rules')}
                </Link>
              ) : null}
              {canSeePayroll ? (
                <Link href="/commissions" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('commissions.title')}
                </Link>
              ) : null}
              {canSeePayroll ? (
                <Link href="/payroll" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('payroll.title')}
                </Link>
              ) : null}
              {canManageUsers ? (
                <Link href="/users" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.users')}
                </Link>
              ) : null}
              {canManageRoles ? (
                <Link href="/roles" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Roles & Permissions
                </Link>
              ) : null}
              {canSeeAudit ? (
                <Link href="/audit-logs" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Audit Logs
                </Link>
              ) : null}
              {canSeeSettings ? (
                <Link href="/settings" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('nav.settings')}
                </Link>
              ) : null}
              {canSeeAlerts ? (
                <Link href="/alerts" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {t('operations.alerts')}
                </Link>
              ) : null}
            </div>
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
