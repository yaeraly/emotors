'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Warranty } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';

export default function WarrantiesPage() {
  const { t } = useTranslation();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Warranty[]>('/warranties')
      .then(setWarranties)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p><h2 className="text-3xl font-bold">{t('service.warranties')}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t('service.warranty')}</th><th className="px-4 py-3">{t('service.customer')}</th><th className="px-4 py-3">{t('sales.product')}</th><th className="px-4 py-3">{t('crm.branch')}</th><th className="px-4 py-3">Starts</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">{t('service.status')}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{warranties.map((warranty) => <tr key={warranty.id}><td className="px-4 py-3 font-bold">{warranty.warrantyNumber}</td><td className="px-4 py-3">{warranty.customer?.fullName}</td><td className="px-4 py-3">{warranty.product?.name ?? '-'}</td><td className="px-4 py-3">{warranty.branch?.name}</td><td className="px-4 py-3">{new Date(warranty.startsAt).toLocaleDateString()}</td><td className="px-4 py-3">{new Date(warranty.expiresAt).toLocaleDateString()}</td><td className="px-4 py-3">{getStatusLabel({ module: 'warranty', status: warranty.status, t })}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
