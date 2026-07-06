'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { WarehouseTopNav } from '@/components/WarehouseTopNav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type BranchWarehouseMetrics = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  branchName?: string | null;
  totalSkuCount: number;
  totalProductQuantity: number;
  totalStockValueKgs: number;
  lastInventoryDate?: string | null;
  isActive: boolean;
};

type Dashboard = {
  totalBranchWarehouses: number;
  totalSku: number;
  totalQuantity: number;
  totalInventoryValueKgs: number;
};

export default function BranchWarehousesPage() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [warehouses, setWarehouses] = useState<BranchWarehouseMetrics[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Dashboard>('/branch-warehouses/dashboard').catch(() => null),
      apiFetch<BranchWarehouseMetrics[]>('/branch-warehouses'),
    ])
      .then(([stats, list]) => {
        setDashboard(stats);
        setWarehouses(list);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('scm.sidebar.warehouse')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branchWarehouse.title')}</h2>
          <p className="mt-2 text-slate-500">{t('branchWarehouse.subtitle')}</p>
        </div>

        <WarehouseTopNav />

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {dashboard ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Card label={t('branchWarehouse.totalWarehouses')} value={String(dashboard.totalBranchWarehouses)} />
            <Card label={t('hqWarehouse.totalProducts')} value={String(dashboard.totalSku)} />
            <Card label={t('hqWarehouse.totalStock')} value={String(dashboard.totalQuantity)} />
            <Card label={t('hqWarehouse.totalValue')} value={`${dashboard.totalInventoryValueKgs.toLocaleString()} KGS`} />
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {warehouses.map((warehouse) => (
            <article key={warehouse.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600">{warehouse.branchName}</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">{warehouse.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{warehouse.city ?? '—'} · {warehouse.code}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${warehouse.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                  {warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <Metric label={t('branchWarehouse.skuCount')} value={String(warehouse.totalSkuCount)} />
                <Metric label={t('hqWarehouse.totalStock')} value={`${warehouse.totalProductQuantity.toLocaleString()} pcs`} />
                <Metric label={t('hqWarehouse.totalValue')} value={`${warehouse.totalStockValueKgs.toLocaleString()} KGS`} className="col-span-2" />
                <Metric
                  label={t('branchWarehouse.lastInventory')}
                  value={warehouse.lastInventoryDate ? new Date(warehouse.lastInventoryDate).toLocaleDateString() : '—'}
                  className="col-span-2"
                />
              </div>
              <Link href={`/branch-warehouses/${warehouse.id}`} className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                {t('common.open')}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </ProtectedShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Metric({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-900">{value}</p>
    </div>
  );
}
