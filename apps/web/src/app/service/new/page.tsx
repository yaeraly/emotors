'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ServiceCustomerSearch } from '@/components/ServiceCustomerSearch';
import { apiFetch } from '@/lib/api';
import type { ServiceCustomerOption, ServiceOrder, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const WARRANTY_OPTIONS = [7, 14, 30, 90];

export default function NewServiceOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [masters, setMasters] = useState<User[]>([]);
  const [customer, setCustomer] = useState<ServiceCustomerOption | null>(null);
  const [masterId, setMasterId] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [mileage, setMileage] = useState('');
  const [complaint, setComplaint] = useState('');
  const [diagnosisResult, setDiagnosisResult] = useState('');
  const [repairDescription, setRepairDescription] = useState('');
  const [laborCost, setLaborCost] = useState('0');
  const [warrantyDays, setWarrantyDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<User[]>('/service-orders/masters')
      .then((result) => {
        setMasters(result);
        setMasterId(result[0]?.id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) {
      setError(t('sales.customerSearch.noResults'));
      return;
    }
    setError('');
    try {
      const order = await apiFetch<ServiceOrder>('/service-orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          masterId,
          problemDescription: complaint,
          vehicle: vehicle || undefined,
          licensePlate: licensePlate || undefined,
          mileage: mileage ? Number(mileage) : undefined,
          complaint,
          diagnosisResult: diagnosisResult || undefined,
          repairDescription: repairDescription || undefined,
          laborCost: Number(laborCost),
          warrantyDays: Number(warrantyDays),
          notes: notes || undefined,
        }),
      });
      router.push(`/service/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('service.newOrder')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <div className="md:col-span-2">
            <ServiceCustomerSearch onSelect={setCustomer} />
            {customer ? (
              <p className="mt-2 text-sm text-green-700">Выбран: {customer.fullName} · {customer.phone}</p>
            ) : null}
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('service.master')}</span>
            <select value={masterId} onChange={(e) => setMasterId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              {masters.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Транспорт</span>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Гос. номер</span>
            <input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Пробег</span>
            <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('service.problem')}</span>
            <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} required className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('service.diagnosisResult')}</span>
            <textarea value={diagnosisResult} onChange={(e) => setDiagnosisResult(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('service.repair')}</span>
            <textarea value={repairDescription} onChange={(e) => setRepairDescription(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('service.laborCost')}</span>
            <input type="number" min="0" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('service.warranty')}</span>
            <select value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
              {WARRANTY_OPTIONS.map((days) => <option key={days} value={days}>{days} дн.</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('common.notes')}</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 min-h-16 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2" type="submit">{t('common.create')}</button>
        </section>
      </form>
    </ProtectedShell>
  );
}
