'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  notes?: string | null;
  supplier?: { name: string };
};

export default function FactoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [factory, setFactory] = useState<Factory | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Factory>(`/procurement/factories/${id}`)
      .then(setFactory)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/procurement/factories" className="text-sm font-semibold text-blue-700">{t('procurement.factories.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{factory?.name ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {factory ? (
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
            <Info label={t('procurement.factories.supplier')} value={factory.supplier?.name ?? '-'} />
            <Info label={t('procurement.factories.city')} value={factory.city ?? '-'} />
            <Info label={t('procurement.factories.address')} value={factory.address ?? '-'} />
            <Info label={t('procurement.factories.productTypes')} value={factory.productTypes?.join(', ') || '-'} />
            <Info label={t('procurement.factories.productionCapacity')} value={factory.productionCapacity ?? '-'} />
            <Info label={t('procurement.factories.notes')} value={factory.notes ?? '-'} />
          </section>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}
