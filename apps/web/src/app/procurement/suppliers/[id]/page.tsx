'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type SupplierContact = {
  id: string;
  fullName: string;
  position?: string | null;
  wechat?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isPrimary: boolean;
};

type Supplier = {
  id: string;
  name: string;
  companyName?: string | null;
  city?: string | null;
  wechat?: string | null;
  phone?: string | null;
  email?: string | null;
  contacts?: SupplierContact[];
};

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    position: '',
    wechat: '',
    phone: '',
    email: '',
    notes: '',
    isPrimary: false,
  });

  async function load() {
    try {
      const [supplierResult, contactResult] = await Promise.all([
        apiFetch<Supplier>(`/procurement/suppliers/${id}`),
        apiFetch<SupplierContact[]>(`/procurement/suppliers/${id}/contacts`),
      ]);
      setSupplier(supplierResult);
      setContacts(contactResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch(`/procurement/suppliers/${id}/contacts`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ fullName: '', position: '', wechat: '', phone: '', email: '', notes: '', isPrimary: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteContact(contactId: string) {
    if (!window.confirm(t('common.delete'))) return;
    try {
      await apiFetch(`/procurement/contacts/${contactId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function setField(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.supplier')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{supplier?.name ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {supplier ? (
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
            <Info label={t('procurement.companyName')} value={supplier.companyName ?? '-'} />
            <Info label="City" value={supplier.city ?? '-'} />
            <Info label={t('procurement.wechat')} value={supplier.wechat ?? '-'} />
            <Info label="Phone" value={supplier.phone ?? '-'} />
          </section>
        ) : null}

        <form onSubmit={createContact} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
          <Input label="Full name" value={form.fullName} onChange={(value) => setField('fullName', value)} required />
          <Input label="Position" value={form.position} onChange={(value) => setField('position', value)} />
          <Input label={t('procurement.wechat')} value={form.wechat} onChange={(value) => setField('wechat', value)} />
          <Input label="Phone" value={form.phone} onChange={(value) => setField('phone', value)} />
          <Input label="Email" value={form.email} onChange={(value) => setField('email', value)} />
          <Input label="Notes" value={form.notes} onChange={(value) => setField('notes', value)} />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.isPrimary} onChange={(event) => setField('isPrimary', event.target.checked)} />
            Primary
          </label>
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-3" type="submit">
            {t('common.create')}
          </button>
        </form>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">WeChat</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Primary</th><th className="px-4 py-3">{t('common.actions')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => <tr key={contact.id}><td className="px-4 py-3 font-bold">{contact.fullName}</td><td className="px-4 py-3">{contact.position}</td><td className="px-4 py-3">{contact.wechat}</td><td className="px-4 py-3">{contact.phone}</td><td className="px-4 py-3">{contact.isPrimary ? 'Yes' : 'No'}</td><td className="px-4 py-3"><button onClick={() => void deleteContact(contact.id)} type="button" className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">{t('common.delete')}</button></td></tr>)}
            </tbody>
          </table>
        </section>
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function Input({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}
