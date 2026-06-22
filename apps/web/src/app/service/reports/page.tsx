'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function ServiceReportsPage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Record<string, unknown>>('/service-orders/reports/daily')
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p><h2 className="text-3xl font-bold">{t('nav.reports')}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {report ? Object.entries(report).map(([key, value]) => <div key={key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-400">{key}</p><p className="mt-2 text-2xl font-bold">{String(value)}</p></div>) : null}
        </div>
      </section>
    </ProtectedShell>
  );
}
