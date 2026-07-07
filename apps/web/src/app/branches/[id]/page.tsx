'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canAssignBranchHqWarehouse } from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [dashboard, setDashboard] = useState<{ branch?: Branch } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hqWarehouses, setHqWarehouses] = useState<Warehouse[]>([]);
  const [assignedHqWarehouseId, setAssignedHqWarehouseId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [dashboardData, me, branchData, warehouses] = await Promise.all([
      apiFetch<{ branch: Branch }>(`/branches/${id}/dashboard`),
      apiFetch<User>('/auth/me'),
      apiFetch<Branch>(`/branches/${id}`),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
    ]);
    setDashboard(dashboardData);
    setBranch(branchData);
    setUser(me);
    setHqWarehouses(warehouses);
    setAssignedHqWarehouseId(branchData.assignedHqWarehouseId ?? '');
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!branch) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await apiFetch<Branch>(`/branches/${branch.id}/assigned-hq-warehouse`, {
        method: 'PUT',
        body: JSON.stringify({
          assignedHqWarehouseId: assignedHqWarehouseId || null,
        }),
      });
      setBranch(updated);
      setSuccess(t('branchHqRouting.assignmentSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const canAssign = canAssignBranchHqWarehouse(user);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/branches" className="text-sm font-semibold text-blue-600">← {t('nav.branches')}</Link>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branches.detail')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{branch?.name ?? dashboard?.branch?.name ?? '-'}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {canAssign ? (
          <form onSubmit={(event) => void saveAssignment(event)} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('branchHqRouting.assignHqWarehouse')}</h3>
            <p className="mt-1 text-sm text-slate-500">{t('branchHqRouting.assignHqWarehouseHint')}</p>
            <label className="mt-4 block max-w-xl">
              <span className="text-sm font-semibold text-slate-700">{t('branchHqRouting.assignedHqWarehouse')}</span>
              <select
                value={assignedHqWarehouseId}
                onChange={(event) => setAssignedHqWarehouseId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="">{t('branchHqRouting.noWarehouseSelected')}</option>
                {hqWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </form>
        ) : branch?.assignedHqWarehouse ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchHqRouting.assignedHqWarehouse')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branch.assignedHqWarehouse.name}</p>
          </div>
        ) : null}

        {dashboard ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(dashboard)
              .filter(([key]) => key !== 'branch')
              .map(([key, value]) => (
                <div key={key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{key}</p>
                  <p className="mt-2 text-lg font-bold text-slate-950">{String(value)}</p>
                </div>
              ))}
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
