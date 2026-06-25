'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = {
  id: string;
  name: string;
  companyName?: string | null;
  country?: string | null;
  city?: string | null;
  wechat?: string | null;
  phone?: string | null;
  email?: string | null;
  reliabilityScore?: string | number;
};

export default function SuppliersPage() {
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    apiFetch<Supplier[]>('/procurement/suppliers')
      .then(setSuppliers)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('procurement.suppliers.title')}</h2>
          </div>
          <Link href="/procurement/suppliers/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
            {t('procurement.suppliers.new')}
          </Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('procurement.suppliers.name')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.companyName')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.country')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.city')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.wechat')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.phone')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="px-4 py-3 font-bold">{supplier.name}</td>
                  <td className="px-4 py-3">{supplier.companyName ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.country ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.city ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.wechat ?? '-'}</td>
                  <td className="px-4 py-3">{supplier.phone ?? '-'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/procurement/suppliers/${supplier.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                      {t('common.open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
