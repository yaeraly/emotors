'use client';

import { useEffect, useState } from 'react';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { FinanceAuditEntry } from '@/lib/types';

export default function FinanceAuditPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<FinanceAuditEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<FinanceAuditEntry[]>('/finance/audit')
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <FinanceLayout titleKey="finance.audit" breadcrumbs={[{ labelKey: 'finance.audit' }]}>
      {error ? <FinanceErrorState message={error} /> : null}
      {entries.length === 0 ? <FinanceEmptyState messageKey="finance.noAudit" /> : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3">{t('users.user')}</th>
                <th className="px-4 py-3">{t('finance.operation')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('finance.beforeBalance')}</th>
                <th className="px-4 py-3">{t('finance.afterBalance')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(entry.timestamp).toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-3">{entry.user?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">{entry.action}</td>
                  <td className="px-4 py-3 text-right">{typeof entry.metadata?.amount === 'number' ? <FinanceMoney amount={entry.metadata.amount} /> : '—'}</td>
                  <td className="px-4 py-3 text-right">{typeof entry.metadata?.beforeBalance === 'number' ? <FinanceMoney amount={entry.metadata.beforeBalance} /> : '—'}</td>
                  <td className="px-4 py-3 text-right">{typeof entry.metadata?.afterBalance === 'number' ? <FinanceMoney amount={entry.metadata.afterBalance} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FinanceLayout>
  );
}
