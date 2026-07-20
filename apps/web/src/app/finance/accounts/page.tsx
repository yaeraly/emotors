'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { hasPermission, isBranchAccountantUser } from '@/lib/rbac';
import type { FinanceAccount, FinanceAccountTypeDefinition, User } from '@/lib/types';

function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default function FinanceAccountsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [types, setTypes] = useState<FinanceAccountTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', typeCode: 'CASH', currency: 'KGS' });

  const canManage = user && (hasPermission(user, 'finance.manage') || isBranchAccountantUser(user));

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<FinanceAccountTypeDefinition[]>('/finance/account-types'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([accountRows, typeRows, currentUser]) => {
        setAccounts(accountRows);
        setTypes(typeRows);
        setUser(currentUser);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [t]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/accounts', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ name: '', typeCode: 'CASH', currency: 'KGS' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/finance" className="text-sm font-semibold text-blue-600">{t('nav.finance')}</Link>
            <h2 className="text-3xl font-bold">{t('finance.accounts')}</h2>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => setShowCreate((value) => !value)}
              className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white"
            >
              {t('finance.createAccount')}
            </button>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {showCreate ? (
          <form onSubmit={onCreate} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-4">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t('finance.accountName')}
              className="rounded-xl border border-slate-300 px-4 py-3"
              required
            />
            <select
              value={form.typeCode}
              onChange={(event) => setForm({ ...form, typeCode: event.target.value })}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              {types.map((type) => (
                <option key={type.code} value={type.code}>{type.name}</option>
              ))}
            </select>
            <input
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value })}
              className="rounded-xl border border-slate-300 px-4 py-3"
            />
            <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">
              {t('common.save')}
            </button>
          </form>
        ) : null}

        {loading ? (
          <p>{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">{t('finance.accountName')}</th>
                  <th className="px-4 py-3">{t('finance.accountType')}</th>
                  <th className="px-4 py-3">{t('finance.balance')}</th>
                  <th className="px-4 py-3">{t('distribution.status')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{account.name}</div>
                      <div className="text-xs text-slate-500">{account.accountNumber}</div>
                    </td>
                    <td className="px-4 py-3">{account.typeDefinition?.name ?? account.typeCode}</td>
                    <td className="px-4 py-3">{formatMoney(Number(account.currentBalance), account.currency)}</td>
                    <td className="px-4 py-3">{account.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ProtectedShell>
  );
}
