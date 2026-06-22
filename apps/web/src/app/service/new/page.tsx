'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Customer, ServiceOrder, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewServiceOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [masters, setMasters] = useState<User[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [masterId, setMasterId] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Customer[]>('/customers'),
      apiFetch<User[]>('/service-orders/masters'),
    ]).then(([customerResult, masterResult]) => {
      setCustomers(customerResult);
      setMasters(masterResult);
      setCustomerId(customerResult[0]?.id ?? '');
      setMasterId(masterResult[0]?.id ?? '');
    }).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const order = await apiFetch<ServiceOrder>('/service-orders', {
        method: 'POST',
        body: JSON.stringify({ customerId, masterId, problemDescription }),
      });
      router.push(`/service/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p><h2 className="text-3xl font-bold text-slate-950">{t('service.newOrder')}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('service.customer')}</span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName} · {customer.phone}</option>)}</select></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('service.master')}</span><select value={masterId} onChange={(event) => setMasterId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{masters.map((master) => <option key={master.id} value={master.id}>{master.fullName}</option>)}</select></label>
          <label className="block md:col-span-2"><span className="text-sm font-semibold text-slate-700">{t('service.problem')}</span><textarea value={problemDescription} onChange={(event) => setProblemDescription(event.target.value)} required className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2" type="submit">{t('common.create')}</button>
        </section>
      </form>
    </ProtectedShell>
  );
}
