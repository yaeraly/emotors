'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
  FinanceStatusBadge,
} from '@/components/finance/FinanceLayout';
import { FINANCE_ACCOUNT_TYPE_TABS } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canManageFinanceAccounts } from '@/lib/finance-rbac';
import type { FinanceAccount, FinanceAccountTypeDefinition, User } from '@/lib/types';

export default function FinanceAccountsPage() {
  return (
    <Suspense fallback={null}>
      <FinanceAccountsPageContent />
    </Suspense>
  );
}

function FinanceAccountsPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get('type');
  const statusFilter = searchParams.get('status');
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [types, setTypes] = useState<FinanceAccountTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const query = params.toString() ? `?${params}` : '';
    Promise.all([
      apiFetch<FinanceAccount[]>(`/finance/accounts${query}`),
      apiFetch<FinanceAccountTypeDefinition[]>('/finance/account-types'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([rows, typeRows, currentUser]) => {
        setAccounts(rows);
        setTypes(typeRows);
        setUser(currentUser);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [statusFilter, t]);

  const filtered = useMemo(() => {
    const otherTypes = new Set(['DEPOSIT', 'CREDIT_LINE', 'PETTY_CASH', 'PAYROLL_ACCOUNT', 'SUPPLIER_ACCOUNT']);
    return accounts.filter((account) => {
      if (typeFilter === 'OTHER') return otherTypes.has(account.typeCode);
      if (typeFilter && typeFilter !== 'OTHER' && account.typeCode !== typeFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return account.name.toLowerCase().includes(q) || account.accountNumber.toLowerCase().includes(q);
      }
      return true;
    });
  }, [accounts, typeFilter, search]);

  const canManage = user && canManageFinanceAccounts(user);

  return (
    <FinanceLayout
      titleKey="finance.accounts"
      breadcrumbs={[{ labelKey: 'finance.accounts' }]}
      sectionTabs={FINANCE_ACCOUNT_TYPE_TABS}
      primaryAction={
        canManage ? (
          <Link href="/finance/accounts/new" className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">
            {t('finance.createAccount')}
          </Link>
        ) : undefined
      }
    >
      {error ? <FinanceErrorState message={error} /> : null}
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('finance.searchAccounts')}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 md:max-w-md"
      />
      {loading ? <FinanceLoadingState /> : null}
      {!loading && filtered.length === 0 ? <FinanceEmptyState messageKey="finance.noAccounts" /> : null}
      {!loading && filtered.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">{t('finance.account')}</th>
                  <th className="px-4 py-3">{t('finance.accountType')}</th>
                  <th className="px-4 py-3">{t('finance.balance')}</th>
                  <th className="px-4 py-3">{t('finance.availableBalance')}</th>
                  <th className="px-4 py-3">{t('finance.pendingBalance')}</th>
                  <th className="px-4 py-3">{t('finance.assignedEmployee')}</th>
                  <th className="px-4 py-3">{t('distribution.status')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{account.name}</div>
                      <div className="text-xs text-slate-500">{account.accountNumber}</div>
                    </td>
                    <td className="px-4 py-3">{account.typeDefinition?.name ?? account.typeCode}</td>
                    <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(account.currentBalance)} currency={account.currency} /></td>
                    <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(account.availableBalance)} currency={account.currency} /></td>
                    <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(account.pendingBalance)} currency={account.currency} /></td>
                    <td className="px-4 py-3">{account.assignments?.map((a) => a.user.fullName).join(', ') || '—'}</td>
                    <td className="px-4 py-3"><FinanceStatusBadge status={account.status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/finance/accounts/${account.id}`} className="font-semibold text-blue-600">{t('common.view')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {filtered.map((account) => (
              <Link key={account.id} href={`/finance/accounts/${account.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{account.name}</p>
                    <p className="text-xs text-slate-500">{account.typeDefinition?.name ?? account.typeCode}</p>
                  </div>
                  <FinanceStatusBadge status={account.status} />
                </div>
                <p className="mt-3 text-lg font-bold"><FinanceMoney amount={Number(account.currentBalance)} currency={account.currency} /></p>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </FinanceLayout>
  );
}
