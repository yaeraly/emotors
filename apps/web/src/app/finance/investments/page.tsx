'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canCreateOwnerInvestment } from '@/lib/finance-rbac';
import type { FinanceAccount, FinanceLedgerEntry, User } from '@/lib/types';

export default function FinanceInvestmentsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [investments, setInvestments] = useState<FinanceLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ accountId: '', amount: '', investmentType: 'OWNER_INVESTMENT' });

  const load = () => {
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<FinanceLedgerEntry[]>('/finance/investments'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([accountRows, investmentRows, currentUser]) => {
        setAccounts(accountRows);
        setInvestments(investmentRows);
        setUser(currentUser);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  };

  useEffect(() => { load(); }, [t]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/investments', {
        method: 'POST',
        body: JSON.stringify({ accountId: form.accountId, amount: Number(form.amount), investmentType: form.investmentType }),
      });
      setForm({ accountId: '', amount: '', investmentType: 'OWNER_INVESTMENT' });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  };

  return (
    <FinanceLayout titleKey="finance.investments" breadcrumbs={[{ labelKey: 'finance.investments' }]}>
      {error ? <FinanceErrorState message={error} /> : null}
      {user && canCreateOwnerInvestment(user) ? (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-4">
          <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
            <option value="">{t('finance.account')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={t('finance.amount')} className="rounded-xl border border-slate-300 px-4 py-3" />
          <select value={form.investmentType} onChange={(e) => setForm({ ...form, investmentType: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
            <option value="OWNER_INVESTMENT">{t('finance.ownerInvestment')}</option>
            <option value="CAPITAL_INJECTION">{t('finance.capitalInjection')}</option>
          </select>
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('finance.invest')}</button>
        </form>
      ) : null}
      {investments.length === 0 ? <FinanceEmptyState messageKey="finance.noInvestments" /> : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('finance.operation')}</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{entry.entryNumber}</td>
                  <td className="px-4 py-3">{entry.account?.name}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(entry.amount)} currency={entry.currency} /></td>
                  <td className="px-4 py-3">{entry.entryType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FinanceLayout>
  );
}
