'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canManageFinanceAccounts } from '@/lib/finance-rbac';
import type { FinanceAccount, User } from '@/lib/types';

import { toast } from '@/lib/toast';

type ExpenseRow = {
  id: string;
  expenseNumber: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
  expenseDate: string;
  account: { name: string };
};

export default function FinanceExpensesPage() {
  return (
    <Suspense fallback={null}>
      <FinanceExpensesPageContent />
    </Suspense>
  );
}

function FinanceExpensesPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const isNew = searchParams.get('new') === '1';
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: '', accountId: '', amount: '', payee: '', purpose: '' });

  const load = () => {
    Promise.all([
      apiFetch<ExpenseRow[]>('/finance/expenses'),
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([expenseRows, accountRows, currentUser]) => {
        setRows(expenseRows);
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
      await apiFetch('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          accountId: form.accountId,
          amount: Number(form.amount),
          payee: form.payee,
          purpose: form.purpose,
        }),
      });
      setForm({ category: '', accountId: '', amount: '', payee: '', purpose: '' });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <FinanceLayout
      titleKey="finance.expenses"
      breadcrumbs={[{ labelKey: 'finance.expenses' }]}
      primaryAction={user && canManageFinanceAccounts(user) ? <Link href="/finance/expenses/new" className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('finance.createExpense')}</Link> : undefined}
    >
      {error ? <FinanceErrorState message={error} /> : null}
      {isNew && user && canManageFinanceAccounts(user) ? (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
          <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('finance.expenseCategory')} className="rounded-xl border border-slate-300 px-4 py-3" />
          <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
            <option value="">{t('finance.account')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={t('finance.amount')} className="rounded-xl border border-slate-300 px-4 py-3" />
          <input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder={t('finance.payee')} className="rounded-xl border border-slate-300 px-4 py-3" />
          <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder={t('finance.purpose')} className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2" />
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-3">{t('finance.createExpense')}</button>
        </form>
      ) : null}
      {loading ? <FinanceLoadingState /> : null}
      {!loading && rows.length === 0 ? <FinanceEmptyState messageKey="finance.noExpenses" /> : null}
      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.expenseNumber')}</th>
                <th className="px-4 py-3">{t('finance.expenseCategory')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.expenseNumber}</td>
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3">{row.account.name}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(row.amount)} currency={row.currency} /></td>
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
