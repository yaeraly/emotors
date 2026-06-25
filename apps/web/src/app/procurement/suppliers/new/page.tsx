'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewSupplierPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    country: 'China',
    city: '',
    address: '',
    wechat: '',
    phone: '',
    email: '',
    website: '',
    productTypes: '',
    reliabilityScore: '0',
    notes: '',
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/procurement/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          productTypes: splitList(form.productTypes),
          reliabilityScore: Number(form.reliabilityScore || 0),
        }),
      });
      window.localStorage.setItem('emotors_procurement_success', t('procurement.suppliers.created'));
      router.push('/procurement/suppliers');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
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
          <Link href="/procurement/suppliers" className="text-sm font-semibold text-blue-700">{t('procurement.suppliers.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.suppliers.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <Input label={t('procurement.suppliers.name')} value={form.name} onChange={(value) => setField('name', value)} required />
          <Input label={t('procurement.suppliers.companyName')} value={form.companyName} onChange={(value) => setField('companyName', value)} />
          <Input label={t('procurement.suppliers.country')} value={form.country} onChange={(value) => setField('country', value)} />
          <Input label={t('procurement.suppliers.city')} value={form.city} onChange={(value) => setField('city', value)} />
          <Input label={t('procurement.suppliers.address')} value={form.address} onChange={(value) => setField('address', value)} />
          <Input label={t('procurement.suppliers.wechat')} value={form.wechat} onChange={(value) => setField('wechat', value)} />
          <Input label={t('procurement.suppliers.phone')} value={form.phone} onChange={(value) => setField('phone', value)} />
          <Input label={t('procurement.suppliers.email')} value={form.email} onChange={(value) => setField('email', value)} />
          <Input label={t('procurement.suppliers.website')} value={form.website} onChange={(value) => setField('website', value)} />
          <Input label={t('procurement.suppliers.reliabilityScore')} type="number" value={form.reliabilityScore} onChange={(value) => setField('reliabilityScore', value)} />
          <Input label={t('procurement.suppliers.productTypes')} value={form.productTypes} onChange={(value) => setField('productTypes', value)} placeholder="controllers, motors" />
          <Input label={t('procurement.suppliers.notes')} value={form.notes} onChange={(value) => setField('notes', value)} />
          <div className="flex gap-3 md:col-span-2">
            <Link href="/procurement/suppliers" className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">{t('common.cancel')}</Link>
            <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">
              {saving ? t('common.loading') : t('procurement.suppliers.save')}
            </button>
          </div>
        </section>
      </form>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange, type = 'text', required, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
