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
            <div className="border-t border-slate-100 pt-2">
              {[
                'nav.dashboard',
                'nav.service',
                'nav.inventory',
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
