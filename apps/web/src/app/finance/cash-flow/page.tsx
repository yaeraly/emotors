'use client';

import { useEffect, useState } from 'react';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { FinanceLedgerEntry } from '@/lib/types';

export default function FinanceCashFlowPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FinanceLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<FinanceLedgerEntry[]>('/finance/reports/cash-flow')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const inflow = rows.filter((r) => Number(r.signedAmount) > 0).reduce((s, r) => s + Number(r.amount), 0);
  const outflow = rows.filter((r) => Number(r.signedAmount) < 0).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <FinanceLayout titleKey="finance.cashFlow" breadcrumbs={[{ labelKey: 'finance.cashFlow' }]}>
      {error ? <FinanceErrorState message={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.cashInflow')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={inflow} /></p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.cashOutflow')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={outflow} /></p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.netCashFlow')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={inflow - outflow} /></p></div>
      </div>
      {loading ? <FinanceLoadingState /> : null}
      {!loading && rows.length === 0 ? <FinanceEmptyState messageKey="finance.noCashFlow" /> : null}
      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.operation')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-3">{row.account?.name}</td>
                  <td className="px-4 py-3">{row.entryType}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(row.signedAmount)} currency={row.currency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FinanceLayout>
  );
}
