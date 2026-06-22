'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { ShortageReport } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ShortageReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [report, setReport] = useState<ShortageReport | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      setReport(await apiFetch<ShortageReport>(`/distribution/shortage-reports/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function resolve() {
    setError('');
    setSuccess('');
    try {
      setReport(await apiFetch<ShortageReport>(`/distribution/shortage-reports/${id}/resolve`, { method: 'POST' }));
      setSuccess(t('distribution.reportResolved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('distribution.shortageReport')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{report?.reportNumber ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {report ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-bold">{report.status}</p>
                {report.status === 'OPEN' ? <button onClick={() => void resolve()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">{t('distribution.resolveReport')}</button> : null}
              </div>
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t('sales.product')}</th><th className="px-4 py-3">{t('distribution.expectedQuantity')}</th><th className="px-4 py-3">{t('distribution.actualQuantity')}</th><th className="px-4 py-3">{t('distribution.difference')}</th><th className="px-4 py-3">{t('distribution.status')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{report.items?.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.sku}</td><td className="px-4 py-3">{item.productName}</td><td className="px-4 py-3">{item.expectedQuantity}</td><td className="px-4 py-3">{item.receivedQuantity}</td><td className="px-4 py-3">{item.differenceQuantity}</td><td className="px-4 py-3">{item.type === 'SHORTAGE' ? t('distribution.shortage') : t('distribution.overage')}</td></tr>)}</tbody>
              </table>
            </section>
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
