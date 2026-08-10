'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type Supplier = {
  id: string;
  name: string;
  companyName?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  wechat?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  productTypes?: string[];
  reliabilityScore?: string | number;
  notes?: string | null;
  isActive?: boolean;
  createdAt?: string;
};

const supplierTypes = ['TRADING_COMPANY', 'FACTORY_REPRESENTATIVE', 'DISTRIBUTOR', 'MANUFACTURER', 'OTHER'];
const currencies = ['CNY', 'USD', 'KGS'];
const incoterms = ['EXW', 'FOB', 'CIF', 'DAP'];

export default function EditSupplierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    contactPerson: '',
    country: 'China',
    city: '',
    address: '',
    phone: '',
    mobile: '',
    whatsapp: '',
    wechat: '',
    telegram: '',
    email: '',
    website: '',
    supplierType: 'TRADING_COMPANY',
    productTypes: '',
    moq: '',
    leadTimeDays: '',
    currency: 'CNY',
    paymentTerms: '',
    incoterms: '',
    bankInformation: '',
    taxNumber: '',
    reliabilityScore: '0',
    qualityScore: '',
    deliveryScore: '',
    overallRating: '',
    status: 'ACTIVE',
    notes: '',
    publicNotes: '',
    files: '',
  });

  useEffect(() => {
    apiFetch<Supplier>(`/procurement/suppliers/${id}`)
      .then((result) => {
        setSupplier(result);
        const extras = parseNotes(result.notes);
        setForm({
          name: result.name ?? '',
          companyName: result.companyName ?? '',
          contactPerson: stringValue(extras.contactPerson),
          country: result.country ?? 'China',
          city: result.city ?? '',
          address: result.address ?? '',
          phone: result.phone ?? '',
          mobile: stringValue(extras.mobile),
          whatsapp: stringValue(extras.whatsapp),
          wechat: result.wechat ?? '',
          telegram: stringValue(extras.telegram),
          email: result.email ?? '',
          website: result.website ?? '',
          supplierType: stringValue(extras.supplierType) || 'TRADING_COMPANY',
          productTypes: result.productTypes?.join(', ') ?? '',
          moq: stringValue(extras.moq),
          leadTimeDays: stringValue(extras.leadTimeDays),
          currency: stringValue(extras.currency) || 'CNY',
          paymentTerms: stringValue(extras.paymentTerms),
          incoterms: stringValue(extras.incoterms),
          bankInformation: stringValue(extras.bankInformation),
          taxNumber: stringValue(extras.taxNumber),
          reliabilityScore: String(result.reliabilityScore ?? 0),
          qualityScore: stringValue(extras.qualityScore),
          deliveryScore: stringValue(extras.deliveryScore),
          overallRating: stringValue(extras.overallRating),
          status: result.isActive ? 'ACTIVE' : 'INACTIVE',
          notes: stringValue(extras.internalNotes) || result.notes || '',
          publicNotes: stringValue(extras.publicNotes),
          files: Array.isArray(extras.files) ? extras.files.join(', ') : '',
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch(`/procurement/suppliers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          productTypes: splitList(form.productTypes),
          reliabilityScore: Number(form.reliabilityScore || 0),
          qualityScore: form.qualityScore ? Number(form.qualityScore) : undefined,
          deliveryScore: form.deliveryScore ? Number(form.deliveryScore) : undefined,
          overallRating: form.overallRating ? Number(form.overallRating) : undefined,
          moq: form.moq ? Number(form.moq) : undefined,
          leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
          files: splitList(form.files),
        }),
      });
      window.localStorage.setItem('emotors_procurement_success', t('procurement.suppliers.updated'));
      router.push('/procurement/suppliers');
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
          <Link href={`/procurement/suppliers/${id}`} className="text-sm font-semibold text-blue-700">{t('procurement.suppliers.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.suppliers.edit')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('procurement.suppliers.name')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input label={t('procurement.suppliers.name')} value={form.name} onChange={(value) => setField('name', value)} required />
            <Input label={t('procurement.suppliers.companyName')} value={form.companyName} onChange={(value) => setField('companyName', value)} />
            <Input label={t('crm.fullName')} value={form.contactPerson} onChange={(value) => setField('contactPerson', value)} />
            <Input label={t('procurement.suppliers.country')} value={form.country} onChange={(value) => setField('country', value)} />
            <Input label={t('procurement.suppliers.city')} value={form.city} onChange={(value) => setField('city', value)} />
            <Input label={t('procurement.suppliers.address')} value={form.address} onChange={(value) => setField('address', value)} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('procurement.suppliers.phone')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Input label={t('procurement.suppliers.phone')} value={form.phone} onChange={(value) => setField('phone', value)} />
            <Input label="Mobile" value={form.mobile} onChange={(value) => setField('mobile', value)} />
            <Input label="WhatsApp" value={form.whatsapp} onChange={(value) => setField('whatsapp', value)} />
            <Input label={t('procurement.suppliers.wechat')} value={form.wechat} onChange={(value) => setField('wechat', value)} />
            <Input label="Telegram" value={form.telegram} onChange={(value) => setField('telegram', value)} />
            <Input label={t('procurement.suppliers.email')} type="email" value={form.email} onChange={(value) => setField('email', value)} />
            <Input label={t('procurement.suppliers.website')} value={form.website} onChange={(value) => setField('website', value)} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('procurement.suppliers.productTypes')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Select label="Supplier Type" value={form.supplierType} onChange={(value) => setField('supplierType', value)} options={supplierTypes} />
            <Input label={t('procurement.suppliers.productTypes')} value={form.productTypes} onChange={(value) => setField('productTypes', value)} />
            <Input label="MOQ" type="number" value={form.moq} onChange={(value) => setField('moq', value)} />
            <Input label="Lead Time (days)" type="number" value={form.leadTimeDays} onChange={(value) => setField('leadTimeDays', value)} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('nav.finance')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Select label="Currency" value={form.currency} onChange={(value) => setField('currency', value)} options={currencies} />
            <Input label="Payment Terms" value={form.paymentTerms} onChange={(value) => setField('paymentTerms', value)} />
            <Select label="Incoterms" value={form.incoterms} onChange={(value) => setField('incoterms', value)} options={['', ...incoterms]} />
            <Input label="Bank Information" value={form.bankInformation} onChange={(value) => setField('bankInformation', value)} />
            <Input label="Tax Number" value={form.taxNumber} onChange={(value) => setField('taxNumber', value)} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('procurement.suppliers.reliabilityScore')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Input label={t('procurement.suppliers.reliabilityScore')} type="number" value={form.reliabilityScore} onChange={(value) => setField('reliabilityScore', value)} />
            <Input label="Quality Score" type="number" value={form.qualityScore} onChange={(value) => setField('qualityScore', value)} />
            <Input label="Delivery Score" type="number" value={form.deliveryScore} onChange={(value) => setField('deliveryScore', value)} />
            <Input label="Overall Rating" type="number" value={form.overallRating} onChange={(value) => setField('overallRating', value)} />
            <Select label={t('common.status')} value={form.status} onChange={(value) => setField('status', value)} options={['ACTIVE', 'INACTIVE', 'ARCHIVED']} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('procurement.suppliers.notes')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextArea label={t('procurement.suppliers.notes')} value={form.notes} onChange={(value) => setField('notes', value)} />
            <TextArea label="Public Notes" value={form.publicNotes} onChange={(value) => setField('publicNotes', value)} />
            <Input label="Attachments / Files" value={form.files} onChange={(value) => setField('files', value)} placeholder="logo.png, license.pdf" />
          </div>
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
          <Info label="Supplier ID" value={supplier?.id ?? id} />
          <Info label={t('common.createdDate')} value={supplier?.createdAt ? new Date(supplier.createdAt).toLocaleString() : '-'} />
          <Info label="Created By" value="-" />
        </section>

        <div className="flex gap-3">
          <Link href={`/procurement/suppliers/${id}`} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">{t('common.cancel')}</Link>
          <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">{saving ? t('common.loading') : t('procurement.suppliers.save')}</button>
        </div>
      </form>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange, type = 'text', required, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{options.map((option) => <option key={option} value={option}>{option || '-'}</option>)}</select></label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseNotes(value?: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : { internalNotes: value };
  } catch {
    return { internalNotes: value };
  }
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}
