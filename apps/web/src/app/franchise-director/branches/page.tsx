'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FranchiseDirectorShell, formatMoney } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type BranchRow = {
  id: string;
  name: string;
  code: string;
  region: string | null;
  status: string;
  openedAt?: string | null;
  ownerName?: string | null;
  owner?: { fullName: string } | null;
  manager?: { fullName: string } | null;
  employees: Array<{ id: string }>;
  performance: { revenue: number; kpiScore: number; sales: number; serviceOrders: number };
};

export default function FranchiseDirectorBranchesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (region.trim()) params.set('region', region.trim());
    if (status) params.set('status', status);
    void apiFetch<BranchRow[]>(`/franchise-director/branches?${params.toString()}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [region, status, t]);

  const statuses = useMemo(() => Array.from(new Set(rows.map((row) => row.status))), [rows]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.branches">
      <div className="flex flex-wrap gap-3">
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder={t('franchiseDirector.filterRegion')}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t('common.all')}</option>
          {statuses.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('franchiseDirector.branch')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.region')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.owner')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.manager')}</th>
              <th className="px-4 py-3">{t('common.status')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.openedAt')}</th>
              <th className="px-4 py-3">{t('franchiseDirector.performance')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <Link href={`/franchise-director/branches/${row.id}`} className="font-semibold text-blue-700">
                    {row.name}
                  </Link>
                  <p className="text-xs text-slate-500">{row.code} · {row.employees.length} {t('franchiseDirector.employees')}</p>
                </td>
                <td className="px-4 py-3">{row.region ?? '-'}</td>
                <td className="px-4 py-3">{row.ownerName ?? row.owner?.fullName ?? '-'}</td>
                <td className="px-4 py-3">{row.manager?.fullName ?? '-'}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.openedAt ? new Date(row.openedAt).toLocaleDateString() : '-'}</td>
                <td className="px-4 py-3">
                  {formatMoney(row.performance.revenue)} · KPI {row.performance.kpiScore}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FranchiseDirectorShell>
  );
}
