'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  FranchiseDirectorShell,
  MetricCard,
  formatMoney,
} from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type DashboardResponse = {
  summary: {
    totalFranchises: number;
    activeFranchises: number;
    openingSoon: number;
    suspendedFranchises: number;
    monthlySales: number;
    monthlyServiceOrders: number;
    monthlyRevenue: number;
  };
  topBranches: Array<{ branch: { id: string; name: string }; metrics: { revenue: number; kpiScore: number } }>;
  lowestBranches: Array<{ branch: { id: string; name: string }; metrics: { revenue: number; kpiScore: number } }>;
  kpiCompletion: Array<{ branchId: string; branchName: string; kpiScore: number }>;
  growthByMonth: Array<{ month: string; openings: number; active: number }>;
  notifications: Array<{ id: string; title: string; message: string; createdAt: string }>;
};

export default function FranchiseDirectorDashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<DashboardResponse>('/franchise-director/dashboard')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.dashboard">
      {loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label={t('franchiseDirector.totalFranchises')} value={data.summary.totalFranchises} />
            <MetricCard label={t('franchiseDirector.activeFranchises')} value={data.summary.activeFranchises} />
            <MetricCard label={t('franchiseDirector.openingSoon')} value={data.summary.openingSoon} />
            <MetricCard label={t('franchiseDirector.suspendedFranchises')} value={data.summary.suspendedFranchises} />
            <MetricCard label={t('franchiseDirector.monthlySales')} value={data.summary.monthlySales} />
            <MetricCard label={t('franchiseDirector.monthlyServiceOrders')} value={data.summary.monthlyServiceOrders} />
            <MetricCard label={t('franchiseDirector.monthlyRevenue')} value={formatMoney(data.summary.monthlyRevenue)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">{t('franchiseDirector.topBranches')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.topBranches.map((row) => (
                  <li key={row.branch.id} className="flex items-center justify-between gap-3">
                    <Link href={`/franchise-director/branches/${row.branch.id}`} className="font-semibold text-blue-700">
                      {row.branch.name}
                    </Link>
                    <span>{formatMoney(row.metrics.revenue)} · KPI {row.metrics.kpiScore}%</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">{t('franchiseDirector.lowestBranches')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.lowestBranches.map((row) => (
                  <li key={row.branch.id} className="flex items-center justify-between gap-3">
                    <Link href={`/franchise-director/branches/${row.branch.id}`} className="font-semibold text-blue-700">
                      {row.branch.name}
                    </Link>
                    <span>{formatMoney(row.metrics.revenue)} · KPI {row.metrics.kpiScore}%</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">{t('franchiseDirector.kpiCompletion')}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.kpiCompletion.map((row) => (
                <div key={row.branchId} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <p className="font-semibold text-slate-900">{row.branchName}</p>
                  <p className="text-slate-500">{row.kpiScore}%</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">{t('franchiseDirector.growthChart')}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {data.growthByMonth.map((row) => (
                <div key={row.month} className="rounded-xl bg-slate-50 px-3 py-3 text-sm">
                  <p className="font-semibold text-slate-900">{row.month}</p>
                  <p className="text-slate-500">{t('franchiseDirector.openings')}: {row.openings}</p>
                  <p className="text-slate-500">{t('franchiseDirector.active')}: {row.active}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">{t('franchiseDirector.attentionNotifications')}</h2>
              <Link href="/franchise-director/notifications" className="text-sm font-semibold text-blue-700">
                {t('common.viewAll')}
              </Link>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {data.notifications.length === 0 ? (
                <li className="text-slate-500">{t('franchiseDirector.noNotifications')}</li>
              ) : (
                data.notifications.slice(0, 8).map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-100 px-3 py-2">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-slate-500">{item.message}</p>
                  </li>
                ))
              )}
            </ul>
          </section>
        </>
      ) : null}
    </FranchiseDirectorShell>
  );
}
