'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { shouldHideBranchMasterDuplicateNavTitle } from '@/lib/unified-nav-page-title';
import type { MasterKpi, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ServiceKpiPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [kpi, setKpi] = useState<MasterKpi | null>(null);
  const [error, setError] = useState('');
  const hideServiceSubtitle = shouldHideBranchMasterDuplicateNavTitle(user);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
    apiFetch<MasterKpi>('/service-orders/kpi')
      .then(setKpi)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        {hideServiceSubtitle ? (
          <h2 className="text-3xl font-bold text-slate-950">KPI мастера</h2>
        ) : (
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">KPI мастера</h2>
          </div>
        )}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {kpi ? (
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard label="Завершённые ремонты" value={String(kpi.completedRepairs)} />
            <KpiCard label="Выручка по работам" value={`${kpi.laborRevenue.toLocaleString('ru-RU')} KGS`} />
            <KpiCard label="Среднее время ремонта (ч)" value={kpi.averageRepairTimeHours.toFixed(1)} />
            <KpiCard label="Гарантийные возвраты" value={String(kpi.warrantyReturns)} />
            <KpiCard label="Использовано запчастей" value={String(kpi.partsUsed)} />
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
