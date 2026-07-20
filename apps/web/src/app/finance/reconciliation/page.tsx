'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { FINANCE_RECONCILIATION_TABS } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canManageFinanceAccounts } from '@/lib/finance-rbac';
import type { FinanceAccount, User } from '@/lib/types';

type ReconciliationRow = {
  id: string;
  reconciliationNumber: string;
  statementDate: string;
  systemBalance: number;
  actualBalance: number;
  difference: number;
  status: string;
  account: { name: string; currency: string };
};

export default function FinanceReconciliationPage() {
  return (
    <Suspense fallback={null}>
      <FinanceReconciliationPageContent />
    </Suspense>
  );
}

function FinanceReconciliationPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId') ?? '';
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ accountId, actualBalance: '', notes: '' });

  const load = () => {
    Promise.all([
      apiFetch<ReconciliationRow[]>('/finance/reconciliations'),
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([reconRows, accountRows, currentUser]) => {
        setRows(reconRows);
        setAccounts(accountRows);
        setUser(currentUser);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [t]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/reconciliations', {
        method: 'POST',
        body: JSON.stringify({
          accountId: form.accountId,
          actualBalance: Number(form.actualBalance),
          notes: form.notes || undefined,
        }),
      });
      setForm({ accountId: '', actualBalance: '', notes: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <FinanceLayout titleKey="finance.reconciliation" breadcrumbs={[{ labelKey: 'finance.reconciliation' }]} sectionTabs={FINANCE_RECONCILIATION_TABS}>
      {error ? <FinanceErrorState message={error} /> : null}
      {user && canManageFinanceAccounts(user) ? (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-4">
          <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
            <option value="">{t('finance.account')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input required type="number" min="0" step="0.01" value={form.actualBalance} onChange={(e) => setForm({ ...form, actualBalance: e.target.value })} placeholder={t('finance.statementBalance')} className="rounded-xl border border-slate-300 px-4 py-3" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('finance.notes')} className="rounded-xl border border-slate-300 px-4 py-3" />
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('finance.newReconciliation')}</button>
        </form>
      ) : null}
      {loading ? <FinanceLoadingState /> : null}
      {!loading && rows.length === 0 ? <FinanceEmptyState messageKey="finance.noReconciliations" /> : null}
      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.reconciliationNumber')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.systemBalance')}</th>
                <th className="px-4 py-3">{t('finance.statementBalance')}</th>
                <th className="px-4 py-3">{t('finance.difference')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.reconciliationNumber}</td>
                  <td className="px-4 py-3">{row.account.name}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(row.systemBalance)} currency={row.account.currency} /></td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(row.actualBalance)} currency={row.account.currency} /></td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(row.difference)} currency={row.account.currency} /></td>
                  <td className="px-4 py-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FinanceLayout>
  );
}
