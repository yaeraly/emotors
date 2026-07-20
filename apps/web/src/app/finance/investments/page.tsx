'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { FinanceAccount, FinanceLedgerEntry } from '@/lib/types';

export default function FinanceInvestmentsPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [investments, setInvestments] = useState<FinanceLedgerEntry[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ accountId: '', amount: '', investmentType: 'OWNER_INVESTMENT' });

  const load = () => {
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<FinanceLedgerEntry[]>('/finance/investments'),
    ])
      .then(([accountRows, investmentRows]) => {
        setAccounts(accountRows);
        setInvestments(investmentRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  };

  useEffect(() => {
    load();
  }, [t]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/investments', {
        method: 'POST',
        body: JSON.stringify({
          accountId: form.accountId,
          amount: Number(form.amount),
          investmentType: form.investmentType,
        }),
      });
      setForm({ accountId: '', amount: '', investmentType: 'OWNER_INVESTMENT' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/finance" className="text-sm font-semibold text-blue-600">{t('nav.finance')}</Link>
          <h2 className="text-3xl font-bold">{t('finance.investments')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-4">
          <select
            value={form.accountId}
            onChange={(event) => setForm({ ...form, accountId: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          >
            <option value="">{t('finance.account')}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            placeholder={t('finance.amount')}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          />
          <select
            value={form.investmentType}
            onChange={(event) => setForm({ ...form, investmentType: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="OWNER_INVESTMENT">{t('finance.ownerInvestment')}</option>
            <option value="CAPITAL_INJECTION">{t('finance.capitalInjection')}</option>
          </select>
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">
            {t('finance.invest')}
          </button>
        </form>

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
                  <td className="px-4 py-3">{Number(entry.amount).toLocaleString('ru-RU')} {entry.currency}</td>
                  <td className="px-4 py-3">{entry.entryType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
