'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FranchiseDirectorShell, formatMoney } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type BranchRow = {
  id: string;
  name: string;
  region: string | null;
  status: string;
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

export default function FranchiseDirectorPerformancePage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [region, setRegion] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (region.trim()) params.set('region', region.trim());
    if (branchId) params.set('branchId', branchId);
    if (status) params.set('status', status);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    void apiFetch<BranchRow[]>(`/franchise-director/branches?${params.toString()}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [region, branchId, status, dateFrom, dateTo, t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.performance">
      <div className="grid gap-3 md:grid-cols-5">
        <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={t('franchiseDirector.filterRegion')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t('franchiseDirector.allBranches')}</option>
          {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t('common.all')}</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="PENDING">PENDING</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">{t('franchiseDirector.branch')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.sales')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.serviceOrders')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.revenue')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.profit')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.customers')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.satisfaction')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.inventoryTurnover')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.warrantyCases')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.employees')}</th>
              <th className="px-3 py-3">{t('franchiseDirector.kpiScore')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-3">
                  <Link href={`/franchise-director/branches/${row.id}`} className="font-semibold text-blue-700">{row.name}</Link>
                </td>
                <td className="px-3 py-3">{row.performance.sales}</td>
                <td className="px-3 py-3">{row.performance.serviceOrders}</td>
                <td className="px-3 py-3">{formatMoney(row.performance.revenue)}</td>
                <td className="px-3 py-3">{formatMoney(row.performance.profit)}</td>
                <td className="px-3 py-3">{row.performance.customerCount}</td>
                <td className="px-3 py-3">{row.performance.customerSatisfaction}</td>
                <td className="px-3 py-3">{row.performance.inventoryTurnover}</td>
                <td className="px-3 py-3">{row.performance.warrantyCases}</td>
                <td className="px-3 py-3">{row.performance.employeeCount}</td>
                <td className="px-3 py-3">{row.performance.kpiScore}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FranchiseDirectorShell>
  );
}
