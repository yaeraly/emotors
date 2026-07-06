'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { warehouseHubSections } from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type Tab = 'dashboard' | 'products' | 'stock' | 'receiving' | 'distribution' | 'inventory' | 'movements';

type WarehouseDetail = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  branchName?: string | null;
  totalSkuCount: number;
  totalProductQuantity: number;
  totalStockValueKgs: number;
  reservedQuantity: number;
  availableQuantity: number;
};

export default function BranchWarehouseDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [warehouse, setWarehouse] = useState<WarehouseDetail | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, [params.id, tab]);

  async function load() {
    try {
      const detail = await apiFetch<WarehouseDetail>(`/branch-warehouses/${params.id}`);
      setWarehouse(detail);
      if (tab === 'products') setRows(await apiFetch(`/branch-warehouses/${params.id}/products`));
      if (tab === 'stock') setRows(await apiFetch(`/branch-warehouses/${params.id}/inventory`));
      if (tab === 'receiving') setRows(await apiFetch(`/branch-warehouses/${params.id}/receivings`));
      if (tab === 'distribution') setRows(await apiFetch(`/branch-warehouses/${params.id}/distribution`));
      if (tab === 'inventory') setRows(await apiFetch(`/branch-warehouses/${params.id}/inventory-history`));
      if (tab === 'movements') setRows(await apiFetch(`/branch-warehouses/${params.id}/movements`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: t('branchWarehouse.tabs.dashboard') },
    { id: 'products', label: t('branchWarehouse.tabs.products') },
    { id: 'stock', label: t('branchWarehouse.tabs.stock') },
    { id: 'receiving', label: t('branchWarehouse.tabs.receiving') },
    { id: 'distribution', label: t('branchWarehouse.tabs.distribution') },
    { id: 'inventory', label: t('branchWarehouse.tabs.inventoryHistory') },
    { id: 'movements', label: t('branchWarehouse.tabs.movements') },
  ];

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/branch-warehouses" className="text-sm font-semibold text-blue-600">← {t('branchWarehouse.title')}</Link>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{warehouse?.branchName ?? warehouse?.name}</h2>
            <p className="mt-1 text-slate-500">{warehouse?.name} · {warehouse?.code}</p>
          </div>
        </div>

        <ModuleSectionNav sections={warehouseHubSections} />
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && warehouse ? (
          <div className="grid gap-4 md:grid-cols-5">
            <Card label={t('branchWarehouse.skuCount')} value={String(warehouse.totalSkuCount)} />
            <Card label={t('hqWarehouse.totalStock')} value={String(warehouse.totalProductQuantity)} />
            <Card label={t('hqWarehouse.totalValue')} value={`${warehouse.totalStockValueKgs.toLocaleString()} KGS`} />
            <Card label={t('branchWarehouse.reserved')} value={String(warehouse.reservedQuantity)} />
            <Card label={t('branchWarehouse.available')} value={String(warehouse.availableQuantity)} />
          </div>
        ) : null}

        {tab !== 'dashboard' ? (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500">{t('inventoryCount.noHistory')}</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <pre className="whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(row, null, 0).slice(0, 280)}</pre>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
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
