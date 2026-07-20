'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { FinanceSummaryReport } from '@/lib/types';

export default function FinanceReportsPage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<FinanceSummaryReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<FinanceSummaryReport>('/finance/reports/summary')
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/finance" className="text-sm font-semibold text-blue-600">{t('nav.finance')}</Link>
          <h2 className="text-3xl font-bold">{t('finance.reports')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {report ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{t('finance.totalBalance')}</p>
                <p className="mt-2 text-2xl font-bold">{Number(report.totals.balance).toLocaleString('ru-RU')}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{t('finance.income')}</p>
                <p className="mt-2 text-2xl font-bold">{Number(report.totals.income).toLocaleString('ru-RU')}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{t('finance.expenses')}</p>
                <p className="mt-2 text-2xl font-bold">{Number(report.totals.expenses).toLocaleString('ru-RU')}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{t('finance.profit')}</p>
                <p className="mt-2 text-2xl font-bold">{Number(report.totals.profit).toLocaleString('ru-RU')}</p>
              </div>
            </div>

            {report.branchSummaries.length > 0 ? (
              <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3">{t('branches.branch')}</th>
                      <th className="px-4 py-3">{t('finance.accounts')}</th>
                      <th className="px-4 py-3">{t('finance.totalBalance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.branchSummaries.map((branch) => (
                      <tr key={branch.branchId} className="border-t border-slate-100">
                        <td className="px-4 py-3">{branch.branchName}</td>
                        <td className="px-4 py-3">{branch.accountCount}</td>
                        <td className="px-4 py-3">{Number(branch.totalBalance).toLocaleString('ru-RU')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
          <p>{t('common.loading')}</p>
        )}
      </section>
    </ProtectedShell>
  );
}
