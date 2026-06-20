'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function WarehousesPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', code: '', address: '' });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setWarehouses(await apiFetch<Warehouse[]>('/inventory/warehouses'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    try {
      if (editing) {
        await apiFetch(`/inventory/warehouses/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/inventory/warehouses', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setEditing(null);
      setForm({ name: '', code: '', address: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function editWarehouse(warehouse: Warehouse) {
    setEditing(warehouse);
    setForm({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address ?? '',
    });
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('inventory.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('warehouse.title')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
          <Input label={t('warehouse.name')} value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Input label={t('warehouse.code')} value={form.code} onChange={(value) => setForm({ ...form, code: value })} />
          <Input label={t('warehouse.address')} value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white" type="submit">
            {editing ? t('warehouse.edit') : t('warehouse.create')}
          </button>
        </form>
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t('warehouse.name')}</th><th className="px-4 py-3">{t('warehouse.code')}</th><th className="px-4 py-3">{t('warehouse.address')}</th><th className="px-4 py-3">{t('common.status')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {warehouses.map((warehouse) => (
                <tr key={warehouse.id}><td className="px-4 py-3 font-bold">{warehouse.name}</td><td className="px-4 py-3">{warehouse.code}</td><td className="px-4 py-3">{warehouse.address}</td><td className="px-4 py-3">{warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')}</td><td className="px-4 py-3"><button onClick={() => editWarehouse(warehouse)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" type="button">{t('common.edit')}</button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}
