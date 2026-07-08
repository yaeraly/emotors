'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { nextHqWarehouseCode } from '@/lib/hq-warehouse-code-utils';
import { canManageHqWarehouse, hasFullAccess } from '@/lib/rbac';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewHqWarehousePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [existingCodes, setExistingCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const lastSourceRef = useRef('');
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

  const canEditCode = hasFullAccess(user);

  useEffect(() => {
    void Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<Warehouse[]>('/hq-warehouses'),
    ])
      .then(([me, warehouses]) => {
        setUser(me);
        setExistingCodes(warehouses.map((warehouse) => warehouse.code));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  useEffect(() => {
    const source = `${form.city}|${form.name}`;
    if (!form.city.trim() && !form.name.trim()) return;
    if (codeManuallyEdited) return;
    if (lastSourceRef.current === source) return;

    lastSourceRef.current = source;
    setGeneratingCode(true);
    const code = nextHqWarehouseCode(form.city, form.name, existingCodes);
    setForm((current) => ({ ...current, code }));
    setGeneratingCode(false);
  }, [codeManuallyEdited, existingCodes, form.city, form.name]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.code.trim()) {
      setError(t('hqWarehouse.codeRequired'));
      return;
    }
    try {
      await apiFetch<{ id: string }>('/hq-warehouses', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      window.localStorage.setItem('emotors_warehouse_success', t('hqWarehouse.createdSuccess'));
      router.push('/hq-warehouses');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    if (key === 'city' || key === 'name') {
      lastSourceRef.current = '';
    }
    setForm((current) => ({ ...current, [key]: value }));
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
          <Field label={t('warehouse.name')} value={form.name} onChange={(value) => updateField('name', value)} required />
          <Field label={t('hqWarehouse.city')} value={form.city} onChange={(value) => updateField('city', value)} required />
          <Field
            label={t('warehouse.code')}
            value={form.code}
            onChange={(value) => {
              setCodeManuallyEdited(true);
              updateField('code', value);
            }}
            required
            readOnly={!canEditCode}
            hint={generatingCode ? t('hqWarehouse.generatingCode') : t('hqWarehouse.codeAutoHint')}
          />
          <Field label={t('hqWarehouse.country')} value={form.country} onChange={(value) => updateField('country', value)} />
          <Field label={t('warehouse.address')} value={form.address} onChange={(value) => updateField('address', value)} className="md:col-span-2" />
          <Field label={t('hqWarehouse.contactPerson')} value={form.contactPerson} onChange={(value) => updateField('contactPerson', value)} />
          <Field label={t('hqWarehouse.phone')} value={form.phone} onChange={(value) => updateField('phone', value)} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('common.status')}</span>
            <select
              value={form.isActive ? 'ACTIVE' : 'INACTIVE'}
              onChange={(e) => updateField('isActive', e.target.value === 'ACTIVE')}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="ACTIVE">{t('warehouse.active')}</option>
              <option value="INACTIVE">{t('warehouse.inactive')}</option>
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.notes')}</span>
            <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={3} />
          </label>
          <button type="submit" disabled={!canManageHqWarehouse(user) || generatingCode} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300 md:col-span-2">
            {t('common.save')}
          </button>
        </form>
      </section>
    </ProtectedShell>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  readOnly,
  hint,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        readOnly={readOnly}
        className={`mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 ${readOnly ? 'bg-slate-50 text-slate-700' : ''}`}
      />
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
