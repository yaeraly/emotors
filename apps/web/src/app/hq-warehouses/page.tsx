'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { hqWarehouseHubSections } from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { canManageHqWarehouse, canDeleteHqWarehouse } from '@/lib/rbac';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Dashboard = {
  totalHqWarehouses: number;
  totalProducts: number;
  totalStock: number;
  totalInventoryValueKgs: number;
  pendingTransfers: number;
};

export default function HqWarehousesPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleteRequireReason, setDeleteRequireReason] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [me, stats, list] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<Dashboard>('/hq-warehouses/dashboard'),
        apiFetch<Warehouse[]>('/hq-warehouses'),
      ]);
      setUser(me);
      setDashboard(stats);
      setWarehouses(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const canDelete = canDeleteHqWarehouse(user);

  async function confirmDelete(reason?: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const result = await apiFetch<{ archived?: boolean }>(`/hq-warehouses/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setSuccess(result.archived ? t('hqWarehouse.archivedInstead') : t('hqWarehouse.deletedSuccess'));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('reason is required')) {
        setDeleteRequireReason(true);
      }
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('hqWarehouse.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('hqWarehouse.list')}</h2>
          </div>
          {canManageHqWarehouse(user) ? (
            <Link href="/hq-warehouses/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('hqWarehouse.create')}
            </Link>
          ) : null}
        </div>

        <ModuleSectionNav sections={hqWarehouseHubSections} />

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {dashboard ? (
          <div className="grid gap-4 md:grid-cols-5">
            <Card label={t('hqWarehouse.totalWarehouses')} value={String(dashboard.totalHqWarehouses)} />
            <Card label={t('hqWarehouse.totalProducts')} value={String(dashboard.totalProducts)} />
            <Card label={t('hqWarehouse.totalStock')} value={String(dashboard.totalStock)} />
            <Card label={t('hqWarehouse.totalValue')} value={`${dashboard.totalInventoryValueKgs.toLocaleString()} KGS`} />
            <Card label={t('hqWarehouse.pendingTransfers')} value={String(dashboard.pendingTransfers)} />
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('warehouse.name')}</th>
                <th className="px-4 py-3">{t('warehouse.code')}</th>
                <th className="px-4 py-3">{t('hqWarehouse.city')}</th>
                <th className="px-4 py-3">{t('hqWarehouse.country')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {warehouses.map((warehouse) => (
                <tr key={warehouse.id}>
                  <td className="px-4 py-3 font-bold">{warehouse.name}</td>
                  <td className="px-4 py-3">{warehouse.code}</td>
                  <td className="px-4 py-3">{(warehouse as Warehouse & { city?: string }).city ?? '—'}</td>
                  <td className="px-4 py-3">{(warehouse as Warehouse & { country?: string }).country ?? '—'}</td>
                  <td className="px-4 py-3">{warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/hq-warehouses/${warehouse.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        {t('common.open')}
                      </Link>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(warehouse);
                            setDeleteRequireReason(false);
                            setError('');
                          }}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                        >
                          {t('common.delete')}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DeleteConfirmModal
        open={!!deleteTarget}
        title={t('common.deleteConfirmTitle')}
        message={t('common.deleteConfirmMessage')}
        requireReason={deleteRequireReason}
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </ProtectedShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
