'use client';

import { useEffect, useState } from 'react';
import {
  FranchiseDirectorShell,
  downloadJsonAsCsv,
  formatMoney,
} from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type ReportResponse = {
  generatedAt: string;
  rows: Array<Record<string, unknown>>;
};

export default function FranchiseDirectorReportsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    region: '',
    branchId: '',
    ownerName: '',
    dateFrom: '',
    dateTo: '',
  });

  async function load() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    try {
      setData(await apiFetch<ReportResponse>(`/franchise-director/reports?${params.toString()}`));
      setError('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.reports">
      <div className="grid gap-3 md:grid-cols-5">
        <input value={filters.region} onChange={(e) => setFilters((c) => ({ ...c, region: e.target.value }))} placeholder={t('franchiseDirector.filterRegion')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input value={filters.branchId} onChange={(e) => setFilters((c) => ({ ...c, branchId: e.target.value }))} placeholder={t('franchiseDirector.branchId')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input value={filters.ownerName} onChange={(e) => setFilters((c) => ({ ...c, ownerName: e.target.value }))} placeholder={t('franchiseDirector.owner')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((c) => ({ ...c, dateFrom: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters((c) => ({ ...c, dateTo: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void load()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          {t('franchiseDirector.generateReport')}
        </button>
        <button
          type="button"
          disabled={!data?.rows?.length}
          onClick={() => data && downloadJsonAsCsv(`franchise-report-${Date.now()}.csv`, data.rows)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t('franchiseDirector.exportCsv')}
        </button>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">{t('franchiseDirector.branch')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.region')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.owner')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.sales')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.serviceOrders')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.revenue')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.profit')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.kpiScore')}</th>
                <th className="px-3 py-3">{t('franchiseDirector.customers')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((row) => (
                <tr key={String(row.branchId)}>
                  <td className="px-3 py-3">{String(row.branchName ?? '-')}</td>
                  <td className="px-3 py-3">{String(row.region ?? '-')}</td>
                  <td className="px-3 py-3">{String(row.owner ?? '-')}</td>
                  <td className="px-3 py-3">{String(row.sales ?? 0)}</td>
                  <td className="px-3 py-3">{String(row.serviceOrders ?? 0)}</td>
                  <td className="px-3 py-3">{formatMoney(Number(row.revenue ?? 0))}</td>
                  <td className="px-3 py-3">{formatMoney(Number(row.profit ?? 0))}</td>
                  <td className="px-3 py-3">{String(row.kpiScore ?? 0)}%</td>
                  <td className="px-3 py-3">{String(row.customers ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FranchiseDirectorShell>
  );
}
