'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
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
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/finance" className="text-sm font-semibold text-blue-600">{t('nav.finance')}</Link>
          <h2 className="text-3xl font-bold">{t('finance.audit')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3">{t('finance.operation')}</th>
                <th className="px-4 py-3">{t('users.user')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(entry.timestamp).toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-3">{entry.action}</td>
                  <td className="px-4 py-3">{entry.user?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">
                    {typeof entry.metadata?.amount === 'number'
                      ? Number(entry.metadata.amount).toLocaleString('ru-RU')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
