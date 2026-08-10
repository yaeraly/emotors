'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type Supplier = { id: string; name: string };

export default function NewFactoryPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ supplierId: '', name: '', city: '', address: '', productTypes: '', productionCapacity: '', notes: '' });

  useEffect(() => {
    apiFetch<Supplier[]>('/procurement/suppliers')
      .then((result) => {
        setSuppliers(result);
        setForm((current) => ({ ...current, supplierId: result[0]?.id ?? '' }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/procurement/factories', {
        method: 'POST',
        body: JSON.stringify({ ...form, productTypes: splitList(form.productTypes) }),
      });
      window.localStorage.setItem('emotors_procurement_success', t('procurement.factories.created'));
      router.push('/procurement/factories');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <Link href="/procurement/factories" className="text-sm font-semibold text-blue-700">{t('procurement.factories.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.factories.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.factories.supplier')}</span><select value={form.supplierId} onChange={(event) => setField('supplierId', event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <Input label={t('procurement.factories.name')} value={form.name} onChange={(value) => setField('name', value)} required />
          <Input label={t('procurement.factories.city')} value={form.city} onChange={(value) => setField('city', value)} />
          <Input label={t('procurement.factories.address')} value={form.address} onChange={(value) => setField('address', value)} />
          <Input label={t('procurement.factories.productTypes')} value={form.productTypes} onChange={(value) => setField('productTypes', value)} placeholder="controllers, motors" />
          <Input label={t('procurement.factories.productionCapacity')} value={form.productionCapacity} onChange={(value) => setField('productionCapacity', value)} />
          <Input label={t('procurement.factories.notes')} value={form.notes} onChange={(value) => setField('notes', value)} />
          <div className="flex gap-3 md:col-span-2">
            <Link href="/procurement/factories" className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">{t('common.cancel')}</Link>
            <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">{saving ? t('common.loading') : t('procurement.factories.save')}</button>
          </div>
        </section>
      </form>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange, required, placeholder }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
