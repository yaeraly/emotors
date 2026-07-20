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

export default function FinanceIncomePage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FinanceLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<FinanceLedgerEntry[]>('/finance/income')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <FinanceLayout titleKey="finance.income" breadcrumbs={[{ labelKey: 'finance.income' }]}>
      {error ? <FinanceErrorState message={error} /> : null}
      {loading ? <FinanceLoadingState /> : null}
      {!loading && rows.length === 0 ? <FinanceEmptyState messageKey="finance.noIncome" /> : null}
      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.operation')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.entryNumber}</td>
                  <td className="px-4 py-3">{row.account?.name}</td>
                  <td className="px-4 py-3">{row.entryType}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(row.amount)} currency={row.currency} /></td>
                  <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FinanceLayout>
  );
}
