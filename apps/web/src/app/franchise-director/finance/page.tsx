'use client';

import { useEffect, useState } from 'react';
import { FranchiseDirectorShell, MetricCard, formatMoney } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type FinanceResponse = {
  totals: { revenue: number; expenses: number; profit: number; overduePayments: number };
  branches: Array<{
    branch: { id: string; name: string };
    revenue: number;
    expenses: number;
    profit: number;
    overduePayments: number;
    outstandingInvoices: Array<{ invoiceNumber: string; totalAmount: number; status: string }>;
  }>;
};

export default function FranchiseDirectorFinancePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinanceResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<FinanceResponse>('/franchise-director/finance')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.finance">
      <p className="text-sm text-slate-500">{t('franchiseDirector.financeReadOnly')}</p>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label={t('franchiseDirector.revenue')} value={formatMoney(data.totals.revenue)} />
            <MetricCard label={t('franchiseDirector.expenses')} value={formatMoney(data.totals.expenses)} />
            <MetricCard label={t('franchiseDirector.profit')} value={formatMoney(data.totals.profit)} />
            <MetricCard label={t('franchiseDirector.overduePayments')} value={data.totals.overduePayments} />
          </div>
          <div className="space-y-3">
            {data.branches.map((row) => (
              <div key={row.branch.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-950">{row.branch.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {t('franchiseDirector.revenue')}: {formatMoney(row.revenue)} · {t('franchiseDirector.expenses')}: {formatMoney(row.expenses)} · {t('franchiseDirector.profit')}: {formatMoney(row.profit)}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-500">
                  {row.outstandingInvoices.slice(0, 5).map((invoice) => (
                    <li key={invoice.invoiceNumber}>{invoice.invoiceNumber}: {formatMoney(Number(invoice.totalAmount))} · {invoice.status}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </FranchiseDirectorShell>
  );
}
