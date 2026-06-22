'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/branches/${id}/dashboard`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branches.detail')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{data?.branch?.name ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(data).filter(([key]) => key !== 'branch').map(([key, value]) => (
              <div key={key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{key}</p>
                <pre className="mt-2 whitespace-pre-wrap text-lg font-bold text-slate-950">{String(value)}</pre>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
