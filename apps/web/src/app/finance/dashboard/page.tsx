'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FinanceLayout, FinanceErrorState, FinanceLoadingState, FinanceMoney } from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canManageFinanceAccounts, isHqFinanceUser } from '@/lib/finance-rbac';
import type { User } from '@/lib/types';

type DashboardData = {
  cards: {
    totalBalance: number;
    cashBalance: number;
    bankBalance: number;
    qrBalance: number;
    posBalance: number;
    availableBalance: number;
    pendingBalance: number;
    todayIncome: number;
    todayExpenses: number;
    netCashFlow: number;
    openShifts: number;
    pendingTransfers: number;
    pendingReconciliations: number;
  };
  hqTotals: { balance: number; accountCount: number } | null;
  branchSummaries: Array<{ branchId: string; branchName: string; totalBalance: number; accountCount: number }>;
};

export default function FinanceDashboardPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiFetch<User>('/auth/me'), apiFetch<DashboardData>('/finance/dashboard')])
      .then(([currentUser, dashboard]) => {
        setUser(currentUser);
        setData(dashboard);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const cards = data
    ? [
        { key: 'finance.totalBalance', value: data.cards.totalBalance },
        { key: 'finance.cashBalance', value: data.cards.cashBalance },
        { key: 'finance.bankBalance', value: data.cards.bankBalance },
        { key: 'finance.qrBalance', value: data.cards.qrBalance },
        { key: 'finance.posBalance', value: data.cards.posBalance },
        { key: 'finance.availableBalance', value: data.cards.availableBalance },
        { key: 'finance.pendingBalance', value: data.cards.pendingBalance },
        { key: 'finance.todayIncome', value: data.cards.todayIncome },
        { key: 'finance.todayExpenses', value: data.cards.todayExpenses },
        { key: 'finance.netCashFlow', value: data.cards.netCashFlow },
        { key: 'finance.openShifts', value: data.cards.openShifts, count: true },
        { key: 'finance.pendingTransfers', value: data.cards.pendingTransfers, count: true },
        { key: 'finance.pendingReconciliations', value: data.cards.pendingReconciliations, count: true },
      ]
    : [];

  return (
    <FinanceLayout titleKey="finance.dashboard">
      {error ? <FinanceErrorState message={error} /> : null}
      {loading ? <FinanceLoadingState /> : null}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div key={card.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{t(card.key)}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {card.count ? card.value : <FinanceMoney amount={card.value} />}
                </p>
              </div>
            ))}
          </div>

          {user && isHqFinanceUser(user) && data.hqTotals ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold">{t('finance.hqDashboard')}</h3>
              <p className="mt-2 text-slate-600">
                {t('finance.hqBalance')}: <FinanceMoney amount={data.hqTotals.balance} /> · {data.hqTotals.accountCount} {t('finance.accounts')}
              </p>
            </div>
          ) : null}

          {data.branchSummaries.length > 0 ? (
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3">{t('branches.branch')}</th>
                    <th className="px-4 py-3">{t('finance.accounts')}</th>
                    <th className="px-4 py-3">{t('finance.totalBalance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.branchSummaries.map((branch) => (
                    <tr key={branch.branchId} className="border-t border-slate-100">
                      <td className="px-4 py-3">{branch.branchName}</td>
                      <td className="px-4 py-3">{branch.accountCount}</td>
                      <td className="px-4 py-3"><FinanceMoney amount={branch.totalBalance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {user && canManageFinanceAccounts(user) ? (
            <div className="flex flex-wrap gap-3">
              <Link href="/finance/accounts/new" className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('finance.createAccount')}</Link>
              <Link href="/finance/transfers/new" className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">{t('finance.createTransfer')}</Link>
              <Link href="/finance/expenses/new" className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">{t('finance.createExpense')}</Link>
            </div>
          ) : null}
        </>
      ) : null}
    </FinanceLayout>
  );
}
