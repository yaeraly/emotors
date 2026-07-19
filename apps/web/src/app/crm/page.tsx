'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { usesUnifiedNav } from '@/lib/unified-nav';
import type { DailySalesReport, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function CrmPage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<DailySalesReport | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
    void apiFetch<DailySalesReport>('/sales/reports/daily')
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const hideQuickLinks = usesUnifiedNav(user);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.crm')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('crm.intelligenceTitle')}</h2>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('sales.title')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{report?.saleCount ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('sales.payments')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{report?.totalPaidAmount ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('crm.totalDebtAmount')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{report?.totalDebtAmount ?? 0}</p>
          </div>
          {!hideQuickLinks ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('sales.profitAmount')}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{report?.totalProfitAmount ?? 0}</p>
            </div>
          ) : null}
        </div>

        {!hideQuickLinks ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/customers" className="rounded-2xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
              {t('nav.customers')}
            </Link>
            <Link href="/follow-ups" className="rounded-2xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
              {t('nav.followUps')}
            </Link>
            <Link href="/sales" className="rounded-2xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
              {t('nav.sales')}
            </Link>
            <Link href="/installments" className="rounded-2xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
              {t('nav.installments')}
            </Link>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
