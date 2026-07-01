'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { TransportCompanyFields } from '@/components/TransportCompanyFields';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewTransportCompanyPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    companyCode: '',
    country: 'China',
    city: '',
    contactPerson: '',
    phone: '',
    whatsapp: '',
    wechat: '',
    email: '',
    address: '',
    transportType: 'UNIVERSAL',
    defaultCurrency: 'CNY',
    notes: '',
    status: 'ACTIVE',
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/procurement/transport-companies', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      window.localStorage.setItem('emotors_procurement_success', t('procurement.transportCompanies.created'));
      router.push('/procurement/transport-companies');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function setField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <Link href="/procurement/transport-companies" className="text-sm font-semibold text-blue-700">{t('procurement.transportCompanies.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.transportCompanies.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <TransportCompanyFields form={form} setField={setField} t={t} />
        <div className="flex gap-3">
          <Link href="/procurement/transport-companies" className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">{t('common.cancel')}</Link>
          <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">
            {saving ? t('common.loading') : t('procurement.transportCompanies.save')}
          </button>
        </div>
      </form>
    </ProtectedShell>
  );
}
