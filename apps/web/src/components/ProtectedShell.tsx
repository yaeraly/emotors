'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { apiFetch, clearToken, getToken } from '@/lib/api';
import type { User } from '@/lib/types';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTranslation } from '@/i18n/useTranslation';

type ProtectedShellProps = {
  children: ReactNode;
};

export function ProtectedShell({ children }: ProtectedShellProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  function logout() {
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

  const canSeeCrm = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const canSeeSales =
    user?.role === 'OWNER' ||
    user?.role === 'MANAGER' ||
    user?.role === 'ACCOUNTANT';
  const canSeeInventory = Boolean(user);
  const canSeeHq =
    user?.role === 'OWNER' || user?.role === 'ACCOUNTANT';
  const canSeeAcademy =
    user?.role === 'OWNER' || user?.role === 'ACADEMY_MANAGER';
  const canSeeMarketing =
    user?.role === 'OWNER' || user?.role === 'MARKETING_MANAGER';
  const canSeeProcurement =
    user?.role === 'OWNER' || user?.role === 'PROCUREMENT_MANAGER';
  const canSeeSupplyChain =
    user?.role === 'OWNER' || user?.role === 'SUPPLY_CHAIN_MANAGER' || user?.role === 'MANAGER';
  const canSeeDistribution = canSeeSupplyChain;
  const canSeeInvestment =
    user?.role === 'OWNER' || user?.role === 'INVESTMENT_MANAGER';
  const canSeeExpansion =
    user?.role === 'OWNER' || user?.role === 'EXPANSION_MANAGER';
  const canSeeTax = user?.role === 'OWNER' || user?.role === 'ACCOUNTANT';
  const canSeeAi = Boolean(user);

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
            <LanguageSwitcher />
            <div className="text-right text-sm">
              <p className="font-semibold text-slate-900">{user?.fullName}</p>
              <p className="text-slate-500">
                {user?.role} · {user?.branch?.name ?? 'Branch'}
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
                  <Link href="/stock-movements" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('inventory.stockMovements')}
                  </Link>
                  <Link href="/warehouses" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('inventory.warehouses')}
                  </Link>
                  <Link href="/inventory/categories" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">
                    {t('inventory.categories')}
                  </Link>
                </div>
              </div>
            ) : null}
            <div className="border-t border-slate-100 pt-2">
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                {t('phase2.title')}
              </p>
              {canSeeHq ? (
                <>
                  <Link href="/branches" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.branches')}</Link>
                  <Link href="/kpi" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.kpi')}</Link>
                  <Link href="/royalty" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.royalty')}</Link>
                  <Link href="/analytics" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.analytics')}</Link>
                </>
              ) : null}
              {canSeeAcademy ? <Link href="/academy" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.academy')}</Link> : null}
              {canSeeMarketing ? <Link href="/marketing" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('nav.marketing')}</Link> : null}
              {canSeeDistribution ? (
                <div className="rounded-xl px-3 py-2">
                  <Link href="/distribution/orders" className="block text-sm font-semibold text-slate-700 hover:text-blue-700">{t('distribution.title')}</Link>
                  <div className="mt-2 space-y-1 pl-2">
                    <Link href="/distribution/orders" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.orders')}</Link>
                    <Link href="/distribution/receivings" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.receiveGoods')}</Link>
                    <Link href="/distribution/shortage-reports" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.shortageReports')}</Link>
                    <Link href="/distribution/invoices" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.invoices')}</Link>
                    <Link href="/distribution/branch-balances" className="block text-xs font-semibold text-slate-500 hover:text-blue-700">{t('distribution.branchBalances')}</Link>
                  </div>
                </div>
              ) : null}
              {canSeeProcurement ? <Link href="/procurement" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('procurement.title')}</Link> : null}
              {canSeeSupplyChain ? <Link href="/supply-chain" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('supplyChain.title')}</Link> : null}
              {canSeeInvestment ? <Link href="/investment" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('investment.title')}</Link> : null}
              {canSeeExpansion ? <Link href="/expansion" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('expansion.title')}</Link> : null}
              {canSeeTax ? <Link href="/tax" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('tax.title')}</Link> : null}
              {canSeeAi ? <Link href="/ai" className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('ai.title')}</Link> : null}
              {[
                'nav.dashboard',
                'nav.service',
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
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
