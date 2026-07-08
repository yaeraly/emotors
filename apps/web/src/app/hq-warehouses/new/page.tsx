'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewHqWarehousePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    code: '',
    country: 'Kyrgyzstan',
    city: '',
    address: '',
    contactPerson: '',
    phone: '',
    notes: '',
    isActive: true,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch<{ id: string }>('/hq-warehouses', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      window.localStorage.setItem('emotors_warehouse_success', t('hqWarehouse.savedSuccess'));
      router.push('/hq-warehouses');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('hqWarehouse.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('hqWarehouse.create')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <Field label={t('warehouse.name')} value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <Field label={t('warehouse.code')} value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
          <Field label={t('hqWarehouse.country')} value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
          <Field label={t('hqWarehouse.city')} value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
          <Field label={t('warehouse.address')} value={form.address} onChange={(value) => setForm({ ...form, address: value })} className="md:col-span-2" />
          <Field label={t('hqWarehouse.contactPerson')} value={form.contactPerson} onChange={(value) => setForm({ ...form, contactPerson: value })} />
          <Field label={t('hqWarehouse.phone')} value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('common.status')}</span>
            <select
              value={form.isActive ? 'ACTIVE' : 'INACTIVE'}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === 'ACTIVE' })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="ACTIVE">{t('warehouse.active')}</option>
              <option value="INACTIVE">{t('warehouse.inactive')}</option>
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.notes')}</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={3} />
          </label>
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2">{t('common.save')}</button>
        </form>
      </section>
    </ProtectedShell>
  );
}

function Field({ label, value, onChange, required, className = '' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} required={required} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
    </label>
  );
}
