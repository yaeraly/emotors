'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Record<string, unknown>>(`/payroll/${id}`)
      .then(setRecord)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('payroll.title')}</p><h2 className="text-3xl font-bold">{String(record?.id ?? '-')}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {record ? <pre className="rounded-3xl border border-slate-200 bg-white p-6 text-sm shadow-sm">{JSON.stringify(record, null, 2)}</pre> : null}
      </section>
    </ProtectedShell>
  );
}
