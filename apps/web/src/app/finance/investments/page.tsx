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
import type { FinanceAccount, FinanceInvestment, User } from '@/lib/types';

const defaultForm = {
  accountId: '',
  amount: '',
  currency: 'KGS',
  investmentDate: new Date().toISOString().slice(0, 10),
  investmentType: 'OWNER_INVESTMENT',
  investorOwnerName: '',
  providedBy: '',
  notes: '',
};

export default function FinanceInvestmentsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [investments, setInvestments] = useState<FinanceInvestment[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultForm);

  const load = () => {
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<FinanceInvestment[]>('/finance/investments'),
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
        body: JSON.stringify({
          accountId: form.accountId,
          amount: Number(form.amount),
          currency: form.currency,
          investmentDate: form.investmentDate,
          investmentType: form.investmentType,
          investorOwnerName: form.investorOwnerName,
          providedBy: form.providedBy,
          notes: form.notes || undefined,
        }),
      });
      setForm({ ...defaultForm, investmentDate: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  };

  const investmentTypeLabel = (type: string) => {
    if (type === 'INVESTOR_INVESTMENT') return t('finance.investorInvestment');
    return t('finance.ownerInvestment');
  };

  return (
    <FinanceLayout titleKey="finance.investments" breadcrumbs={[{ labelKey: 'finance.investments' }]}>
      {error ? <FinanceErrorState message={error} /> : null}
      {user && canCreateOwnerInvestment(user) ? (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2 lg:grid-cols-3">
          <input
            required
            type="date"
            value={form.investmentDate}
            onChange={(e) => setForm({ ...form, investmentDate: e.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
            aria-label={t('finance.investmentDate')}
          />
          <select
            required
            value={form.investmentType}
            onChange={(e) => setForm({ ...form, investmentType: e.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="OWNER_INVESTMENT">{t('finance.ownerInvestment')}</option>
            <option value="INVESTOR_INVESTMENT">{t('finance.investorInvestment')}</option>
          </select>
          <select
            required
            value={form.accountId}
            onChange={(e) => {
              const account = accounts.find((row) => row.id === e.target.value);
              setForm({
                ...form,
                accountId: e.target.value,
                currency: account?.currency ?? form.currency,
              });
            }}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="">{t('finance.account')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder={t('finance.amount')}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <select
            required
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="KGS">KGS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="CNY">CNY</option>
            <option value="RUB">RUB</option>
          </select>
          <input
            required
            value={form.investorOwnerName}
            onChange={(e) => setForm({ ...form, investorOwnerName: e.target.value })}
            placeholder={t('finance.investorOwnerName')}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <input
            required
            value={form.providedBy}
            onChange={(e) => setForm({ ...form, providedBy: e.target.value })}
            placeholder={t('finance.investmentProvidedBy')}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={t('finance.notes')}
            className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2"
          />
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-2 lg:col-span-1">
            {t('finance.invest')}
          </button>
        </form>
      ) : null}
      {investments.length === 0 ? <FinanceEmptyState messageKey="finance.noInvestments" /> : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.investmentDate')}</th>
                <th className="px-4 py-3">{t('finance.investmentType')}</th>
                <th className="px-4 py-3">{t('finance.investorOwnerName')}</th>
                <th className="px-4 py-3">{t('finance.investmentProvidedBy')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                <th className="px-4 py-3">{t('finance.createdBy')}</th>
                <th className="px-4 py-3">{t('finance.createdAt')}</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((investment) => (
                <tr key={investment.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(investment.investmentDate).toLocaleDateString('ru-RU')}</td>
                  <td className="px-4 py-3">{investmentTypeLabel(investment.investmentType)}</td>
                  <td className="px-4 py-3">{investment.investorOwnerName}</td>
                  <td className="px-4 py-3">{investment.providedBy}</td>
                  <td className="px-4 py-3">{investment.account?.name}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(investment.amount)} currency={investment.currency} /></td>
                  <td className="px-4 py-3">{investment.ledgerEntry?.entryNumber ?? investment.investmentNumber}</td>
                  <td className="px-4 py-3">{investment.createdBy?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">{new Date(investment.createdAt).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FinanceLayout>
  );
}
