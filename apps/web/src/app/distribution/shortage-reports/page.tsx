'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersNav } from '@/components/HqSalesBranchOrdersNav';
import { apiFetch } from '@/lib/api';
import type { ShortageReport } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';

export default function ShortageReportsPage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ShortageReport[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<ShortageReport[]>('/distribution/shortage-reports')
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <HqSalesBranchOrdersNav />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(distributionModuleTitleKey(null))}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('distribution.shortageReports')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="h-[calc(100vh-240px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t('distribution.shortageReport')}</th><th className="px-4 py-3">{t('distribution.orderNumber')}</th><th className="px-4 py-3">{t('distribution.branch')}</th><th className="px-4 py-3">{t('distribution.status')}</th><th className="px-4 py-3">{t('distribution.difference')}</th><th className="px-4 py-3">{t('common.createdDate')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => (
                <tr key={report.id}><td className="px-4 py-3 font-bold">{report.reportNumber}</td><td className="px-4 py-3">{report.distributionOrder?.orderNumber}</td><td className="px-4 py-3">{report.branch?.name}</td><td className="px-4 py-3">{report.status}</td><td className="px-4 py-3">{report.items?.length ?? 0}</td><td className="px-4 py-3">{new Date(report.createdAt).toLocaleDateString()}</td><td className="px-4 py-3"><Link href={`/distribution/shortage-reports/${report.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
