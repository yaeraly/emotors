'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FranchiseDirectorShell, MetricCard, formatMoney } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type BranchDetail = {
  id: string;
  name: string;
  code: string;
  region: string | null;
  status: string;
  openedAt?: string | null;
  ownerName?: string | null;
  owner?: { fullName: string; email: string } | null;
  manager?: { fullName: string; email: string } | null;
  employees: Array<{ id: string; fullName: string; role: string; email: string }>;
  performance: {
    sales: number;
    serviceOrders: number;
    revenue: number;
    profit: number;
    customerCount: number;
    customerSatisfaction: number;
    inventoryTurnover: number;
    warrantyCases: number;
    employeeCount: number;
    kpiScore: number;
  };
};

export default function FranchiseDirectorBranchDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<BranchDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.id) return;
    void apiFetch<BranchDetail>(`/franchise-director/branches/${params.id}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [params.id, t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.branchProfile">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-950">{data.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {data.code} · {data.status} · {data.region ?? '-'} · {data.openedAt ? new Date(data.openedAt).toLocaleDateString() : '-'}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <p className="text-sm"><span className="font-semibold">{t('franchiseDirector.owner')}:</span> {data.ownerName ?? data.owner?.fullName ?? '-'}</p>
              <p className="text-sm"><span className="font-semibold">{t('franchiseDirector.manager')}:</span> {data.manager?.fullName ?? '-'}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label={t('franchiseDirector.sales')} value={data.performance.sales} />
            <MetricCard label={t('franchiseDirector.serviceOrders')} value={data.performance.serviceOrders} />
            <MetricCard label={t('franchiseDirector.revenue')} value={formatMoney(data.performance.revenue)} />
            <MetricCard label={t('franchiseDirector.profit')} value={formatMoney(data.performance.profit)} />
            <MetricCard label={t('franchiseDirector.kpiScore')} value={`${data.performance.kpiScore}%`} />
            <MetricCard label={t('franchiseDirector.customers')} value={data.performance.customerCount} />
            <MetricCard label={t('franchiseDirector.satisfaction')} value={data.performance.customerSatisfaction} />
            <MetricCard label={t('franchiseDirector.inventoryTurnover')} value={data.performance.inventoryTurnover} />
            <MetricCard label={t('franchiseDirector.warrantyCases')} value={data.performance.warrantyCases} />
            <MetricCard label={t('franchiseDirector.employees')} value={data.performance.employeeCount} />
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('franchiseDirector.employees')}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {data.employees.map((employee) => (
                <li key={employee.id} className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                  <span className="font-semibold text-slate-900">{employee.fullName}</span>
                  <span className="text-slate-500">{employee.role} · {employee.email}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </FranchiseDirectorShell>
  );
}
