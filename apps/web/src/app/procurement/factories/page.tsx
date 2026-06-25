'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type Factory = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  productTypes?: string[];
  productionCapacity?: string | null;
  supplier?: { name: string };
};

export default function FactoriesPage() {
  const { t } = useTranslation();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    apiFetch<Factory[]>('/procurement/factories')
      .then(setFactories)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('procurement.factories.title')}</h2>
          </div>
          <Link href="/procurement/factories/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">{t('procurement.factories.new')}</Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t('procurement.factories.name')}</th><th className="px-4 py-3">{t('procurement.factories.supplier')}</th><th className="px-4 py-3">{t('procurement.factories.city')}</th><th className="px-4 py-3">{t('procurement.factories.productionCapacity')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {factories.map((factory) => <tr key={factory.id}><td className="px-4 py-3 font-bold">{factory.name}</td><td className="px-4 py-3">{factory.supplier?.name ?? '-'}</td><td className="px-4 py-3">{factory.city ?? '-'}</td><td className="px-4 py-3">{factory.productionCapacity ?? '-'}</td><td className="px-4 py-3"><Link href={`/procurement/factories/${factory.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
