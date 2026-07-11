'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canAssignBranchHqWarehouse } from '@/lib/rbac';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewBranchPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [hqWarehouses, setHqWarehouses] = useState<Warehouse[]>([]);
  const [form, setForm] = useState({
    name: '',
    code: '',
    city: '',
    address: '',
    phone: '',
    ownerName: '',
    branchType: 'FRANCHISE' as 'HQ_BRANCH' | 'FRANCHISE' | 'DEALER' | 'DISTRIBUTOR',
    assignedHqWarehouseId: '',
  });

  useEffect(() => {
    void Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
    ])
      .then(([me, warehouses]) => {
        setUser(me);
        setHqWarehouses(warehouses);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await apiFetch('/branches', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          assignedHqWarehouseId: form.assignedHqWarehouseId || null,
        }),
      });
      setSuccess(t('branches.created'));
      window.localStorage.setItem('emotors-branch-created', '1');
      router.push('/branches');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const canAssign = canAssignBranchHqWarehouse(user);

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <Link href="/branches" className="text-sm font-semibold text-blue-600">← {t('nav.branches')}</Link>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('phase2.title')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branches.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          {(['name', 'code', 'city', 'address', 'phone', 'ownerName'] as const).map((key) => (
            <label key={key} className="block">
              <span className="text-sm font-semibold text-slate-700">{key}</span>
              <input
                value={form[key]}
                onChange={(event) => setField(key, event.target.value)}
                required={key === 'name' || key === 'code'}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
          ))}
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('pricing.colBranchType')}</span>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="branchType"
                  value="HQ_BRANCH"
                  checked={form.branchType === 'HQ_BRANCH'}
                  onChange={() => setField('branchType', 'HQ_BRANCH')}
                />
                {t('pricing.branchTypeHq')}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="branchType"
                  value="FRANCHISE"
                  checked={form.branchType === 'FRANCHISE'}
                  onChange={() => setField('branchType', 'FRANCHISE')}
                />
                {t('branches.branchTypeFranchise')}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="branchType"
                  value="DEALER"
                  checked={form.branchType === 'DEALER'}
                  onChange={() => setField('branchType', 'DEALER')}
                />
                {t('branches.branchTypeDealer')}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="branchType"
                  value="DISTRIBUTOR"
                  checked={form.branchType === 'DISTRIBUTOR'}
                  onChange={() => setField('branchType', 'DISTRIBUTOR')}
                />
                {t('branches.branchTypeDistributor')}
              </label>
            </div>
          </label>
          {canAssign ? (
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('branchHqRouting.assignedHqWarehouse')}</span>
              <select
                value={form.assignedHqWarehouseId}
                onChange={(event) => setField('assignedHqWarehouseId', event.target.value)}
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
          <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300 md:col-span-2" type="submit">
            {saving ? t('common.loading') : t('common.create')}
          </button>
        </section>
      </form>
    </ProtectedShell>
  );
}
