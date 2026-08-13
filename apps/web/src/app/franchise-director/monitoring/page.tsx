'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FranchiseDirectorShell } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type MonitoringResponse = {
  issues: Array<{
    id: string;
    type: string;
    severity: string;
    branchId: string | null;
    branchName: string | null;
    title: string;
    href: string;
  }>;
  counts: Record<string, number>;
};

export default function FranchiseDirectorMonitoringPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<MonitoringResponse>('/franchise-director/monitoring')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.monitoring">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(data.counts).map(([key, value]) => (
              <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-400">{key}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {data.issues.map((issue) => (
              <Link
                key={issue.id}
                href={issue.href}
                className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{issue.title}</p>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                    {issue.severity} · {issue.type}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{issue.branchName ?? t('franchiseDirector.networkWide')}</p>
              </Link>
            ))}
            {data.issues.length === 0 ? (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{t('franchiseDirector.noIssues')}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </FranchiseDirectorShell>
  );
}
