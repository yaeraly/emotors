'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AccountAssignmentsPanel } from '@/components/finance/AccountAssignmentsPanel';
import {
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
  FinanceStatusBadge,
} from '@/components/finance/FinanceLayout';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { FinanceAccount, FinanceLedgerEntry } from '@/lib/types';

export default function FinanceAccountDetailsPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [account, setAccount] = useState<FinanceAccount & { ledgerEntries?: FinanceLedgerEntry[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const reload = () => {
    setLoading(true);
    apiFetch<FinanceAccount & { ledgerEntries?: FinanceLedgerEntry[] }>(`/finance/accounts/${params.id}`)
      .then(setAccount)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, [params.id, t]);

  const tabs = [
    { href: '#overview', labelKey: 'finance.tabOverview' },
    { href: '#transactions', labelKey: 'finance.tabTransactions' },
    { href: '#assignments', labelKey: 'finance.tabAssignments' },
    { href: '#audit', labelKey: 'finance.audit' },
  ];

  return (
    <FinanceLayout
      titleKey="finance.accountDetails"
      breadcrumbs={[
        { href: '/finance/accounts', labelKey: 'finance.accounts' },
        { labelKey: account?.name ?? 'finance.account' },
      ]}
    >
      {error ? <FinanceErrorState message={error} /> : null}
      {loading ? <FinanceLoadingState /> : null}
      {account ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.balance')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={Number(account.currentBalance)} currency={account.currency} /></p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.availableBalance')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={Number(account.availableBalance)} currency={account.currency} /></p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.pendingBalance')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={Number(account.pendingBalance)} currency={account.currency} /></p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('distribution.status')}</p><p className="mt-2"><FinanceStatusBadge status={account.status} /></p></div>
          </div>

          <ModuleSectionNav sections={tabs} variant="tabs" />

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm text-slate-500">{t('finance.accountType')}</dt><dd className="font-semibold">{account.typeDefinition?.name ?? account.typeCode}</dd></div>
              <div><dt className="text-sm text-slate-500">{t('finance.currency')}</dt><dd className="font-semibold">{account.currency}</dd></div>
              <div><dt className="text-sm text-slate-500">{t('finance.accountNumber')}</dt><dd className="font-semibold">{account.accountNumber}</dd></div>
              {account.bankName ? <div><dt className="text-sm text-slate-500">{t('finance.bankName')}</dt><dd className="font-semibold">{account.bankName}</dd></div> : null}
            </dl>
          </div>

          {account.assignments && account.assignments.length > 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold">{t('finance.tabAssignments')}</h3>
              <ul className="mt-3 space-y-2">
                {account.assignments.map((assignment) => (
                  <li key={assignment.id} className="text-sm">
                    {assignment.user.fullName} ({assignment.user.role}) — {assignment.user.email}
                    {assignment.startDate
                      ? ` · ${new Date(assignment.startDate).toLocaleDateString()}`
                      : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AccountAssignmentsPanel account={account} onUpdated={reload} />

          {account.ledgerEntries && account.ledgerEntries.length > 0 ? (
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3">{t('common.date')}</th>
                    <th className="px-4 py-3">{t('finance.operation')}</th>
                    <th className="px-4 py-3">{t('finance.amount')}</th>
                    <th className="px-4 py-3">{t('finance.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {account.ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">{new Date(entry.createdAt).toLocaleString('ru-RU')}</td>
                      <td className="px-4 py-3">{entry.entryType}</td>
                      <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(entry.amount)} currency={entry.currency} /></td>
                      <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(entry.afterBalance)} currency={entry.currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <Link href={`/finance/reconciliation?accountId=${account.id}`} className="inline-flex rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">
            {t('finance.newReconciliation')}
          </Link>
        </>
      ) : null}
    </FinanceLayout>
  );
}
