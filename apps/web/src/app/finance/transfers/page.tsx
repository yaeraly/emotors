'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { FinanceAccount, FinanceTransfer } from '@/lib/types';

export default function FinanceTransfersPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ sourceAccountId: '', destinationAccountId: '', amount: '' });

  const load = () => {
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<FinanceTransfer[]>('/finance/transfers'),
    ])
      .then(([accountRows, transferRows]) => {
        setAccounts(accountRows);
        setTransfers(transferRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  };

  useEffect(() => {
    load();
  }, [t]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/transfers', {
        method: 'POST',
        body: JSON.stringify({
          sourceAccountId: form.sourceAccountId,
          destinationAccountId: form.destinationAccountId,
          amount: Number(form.amount),
        }),
      });
      setForm({ sourceAccountId: '', destinationAccountId: '', amount: '' });
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
          <h2 className="text-3xl font-bold">{t('finance.transfers')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-4">
          <select
            value={form.sourceAccountId}
            onChange={(event) => setForm({ ...form, sourceAccountId: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          >
            <option value="">{t('finance.sourceAccount')}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          <select
            value={form.destinationAccountId}
            onChange={(event) => setForm({ ...form, destinationAccountId: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          >
            <option value="">{t('finance.destinationAccount')}</option>
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
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">
            {t('finance.transfer')}
          </button>
        </form>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                <th className="px-4 py-3">{t('finance.sourceAccount')}</th>
                <th className="px-4 py-3">{t('finance.destinationAccount')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{transfer.transferNumber}</td>
                  <td className="px-4 py-3">{transfer.sourceAccount.name}</td>
                  <td className="px-4 py-3">{transfer.destinationAccount.name}</td>
                  <td className="px-4 py-3">{Number(transfer.amount).toLocaleString('ru-RU')} {transfer.currency}</td>
                  <td className="px-4 py-3">{transfer.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
