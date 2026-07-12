'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { API_URL, apiFetch, clearToken, getToken } from '@/lib/api';
import { canAssignBranchHqWarehouse, canManageBranches } from '@/lib/rbac';
import type { Branch, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type BranchForm = {
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  ownerName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED';
  branchType: 'HQ_BRANCH' | 'FRANCHISE' | 'DEALER' | 'DISTRIBUTOR';
  assignedHqWarehouseId: string;
};

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [dashboard, setDashboard] = useState<{ branch?: Branch } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hqWarehouses, setHqWarehouses] = useState<Warehouse[]>([]);
  const [assignedHqWarehouseId, setAssignedHqWarehouseId] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BranchForm>({
    name: '',
    code: '',
    city: '',
    address: '',
    phone: '',
    ownerName: '',
    status: 'ACTIVE',
    branchType: 'FRANCHISE',
    assignedHqWarehouseId: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    setForm({
      name: branchData.name,
      code: branchData.code,
      city: branchData.city ?? '',
      address: branchData.address ?? '',
      phone: branchData.phone ?? '',
      ownerName: branchData.ownerName ?? '',
      status: branchData.status ?? 'ACTIVE',
      branchType: branchData.branchType ?? 'FRANCHISE',
      assignedHqWarehouseId: branchData.assignedHqWarehouseId ?? '',
    });
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  const canManage = canManageBranches(user);
  const canAssign = canAssignBranchHqWarehouse(user);

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

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branch) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await apiFetch<Branch>(`/branches/${branch.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setBranch(updated);
      setEditing(false);
      setSuccess(t('branches.updated'));
      await load();
    } catch (err) {
      setError(localizeBranchError(err instanceof Error ? err.message : t('common.error'), t));
    } finally {
      setSaving(false);
    }
  }

  async function deleteBranch() {
    if (!branch || !window.confirm(t('branches.confirmDelete'))) return;

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_URL}/branches/${branch.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        clearToken();
        router.replace('/login');
        return;
      }

      if (!response.ok) {
        if (response.status === 403) throw new Error(t('branches.noPermission'));
        if (response.status === 404) throw new Error(t('branches.notFound'));
        throw new Error(t('branches.deleteFailed'));
      }

      const result = (await response.json()) as {
        success?: boolean;
        deletedBranchId?: string;
        message?: string;
      };

      if (!result.success) {
        throw new Error(t('branches.deleteFailed'));
      }

      window.localStorage.setItem('emotors-branch-deleted', t('branches.deletedSuccess'));
      router.replace('/branches');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('branches.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/branches" className="text-sm font-semibold text-blue-600">← {t('nav.branches')}</Link>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branches.detail')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{branch?.name ?? dashboard?.branch?.name ?? '-'}</h2>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing((current) => !current)}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700"
              >
                {editing ? t('common.cancel') : t('common.edit')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteBranch()}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
              >
                {deleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        {canManage && editing ? (
          <form onSubmit={saveBranch} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <BranchInput label={t('warehouse.name')} value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
            <BranchInput label={t('warehouse.code')} value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
            <BranchInput label={t('hqWarehouse.city')} value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
            <BranchInput label={t('warehouse.address')} value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
            <BranchInput label={t('users.phone')} value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <BranchInput label={t('branches.ownerName')} value={form.ownerName} onChange={(value) => setForm({ ...form, ownerName: value })} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('pricing.colBranchType')}</span>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="branchType"
                    value="HQ_BRANCH"
                    checked={form.branchType === 'HQ_BRANCH'}
                    onChange={() => setForm({ ...form, branchType: 'HQ_BRANCH' })}
                  />
                  {t('pricing.branchTypeHq')}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="branchType"
                    value="FRANCHISE"
                    checked={form.branchType === 'FRANCHISE'}
                    onChange={() => setForm({ ...form, branchType: 'FRANCHISE' })}
                  />
                  {t('branches.branchTypeFranchise')}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="branchType"
                    value="DEALER"
                    checked={form.branchType === 'DEALER'}
                    onChange={() => setForm({ ...form, branchType: 'DEALER' })}
                  />
                  {t('branches.branchTypeDealer')}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="branchType"
                    value="DISTRIBUTOR"
                    checked={form.branchType === 'DISTRIBUTOR'}
                    onChange={() => setForm({ ...form, branchType: 'DISTRIBUTOR' })}
                  />
                  {t('branches.branchTypeDistributor')}
                </label>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('common.status')}</span>
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as BranchForm['status'] })}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED'].map((status) => (
                  <option key={status} value={status}>
                    {translateStatus(t, status, 'branch')}
                  </option>
                ))}
              </select>
            </label>
            {canAssign ? (
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('branchHqRouting.assignedHqWarehouse')}</span>
                <select
                  value={form.assignedHqWarehouseId}
                  onChange={(event) => setForm({ ...form, assignedHqWarehouseId: event.target.value })}
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
            ) : null}
            <button disabled={saving} type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300 md:col-span-2">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </form>
        ) : null}

        {canAssign && !editing ? (
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
        ) : branch?.assignedHqWarehouse && !editing ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-400">{t('branchHqRouting.assignedHqWarehouse')}</p>
            <p className="mt-1 font-semibold text-slate-900">{branch.assignedHqWarehouse.name}</p>
            {branch.assignedHqWarehouse.hqManagerAssignments?.[0]?.user?.fullName ? (
              <p className="mt-2 text-sm text-slate-600">
                {t('branchHqRouting.hqWarehouseManager')}: {branch.assignedHqWarehouse.hqManagerAssignments[0].user.fullName}
              </p>
            ) : null}
          </div>
        ) : null}

        {branch && !editing ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-400">{t('pricing.colBranchType')}</p>
            <p className="mt-1 font-semibold text-slate-900">
              {branch.branchType === 'HQ_BRANCH' ? t('pricing.branchTypeHq') : t('pricing.branchTypeFranchise')}
            </p>
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

function BranchInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function localizeBranchError(message: string, t: (key: string) => string) {
  if (message.includes('already exists')) return t('branches.duplicateCode');
  if (message.includes('Forbidden') || message.includes('permission')) return t('branches.noPermission');
  if (message.includes('not found')) return t('branches.notFound');
  return message;
}
