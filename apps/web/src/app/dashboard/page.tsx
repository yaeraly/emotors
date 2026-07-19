'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canViewProcurement,
  hasPermission,
  isBranchOwnerUser,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const branchOwnerView = isBranchOwnerUser(user);
  const canSeeProcurement = canViewProcurement(user);
  const canSeeCustomers = hasPermission(user, 'crm.manage');
  const canSeeSales = hasPermission(user, 'sales.manage');
  const canSeeInventory = hasPermission(user, 'inventory.manage') || hasPermission(user, 'inventory.view');
  const canSeeService = hasPermission(user, 'service.manage');
  const canSeeAnalytics = hasPermission(user, 'reports.view') || hasPermission(user, 'analytics.view');

  return (
    <ProtectedShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.dashboard')}</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('app.name')}</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {canSeeCustomers ? (
            <Link href="/customers" className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{t('nav.customers')}</Link>
          ) : null}
          {canSeeSales ? (
            <Link href="/sales" className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{t('nav.sales')}</Link>
          ) : null}
          {canSeeInventory ? (
            <Link
              href={branchOwnerView ? '/branch-ceo/warehouse' : '/inventory'}
              className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
            >
              {t('nav.inventory')}
            </Link>
          ) : null}
          {canSeeService ? (
            <Link href="/service" className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{t('service.title')}</Link>
          ) : null}
          {canSeeProcurement ? (
            <Link href="/procurement" className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{t('procurement.title')}</Link>
          ) : null}
          {canSeeAnalytics ? (
            <Link href="/analytics" className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">{t('nav.analytics')}</Link>
          ) : null}
        </div>
      </section>
    </ProtectedShell>
  );
}
