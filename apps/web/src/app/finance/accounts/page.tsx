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
import { CenteredDialog } from '@/components/CenteredDialog';
import { FINANCE_ACCOUNT_TYPE_TABS, isCashierOnlyFinanceUser } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canManageFinanceAccounts } from '@/lib/finance-rbac';
import { isHqCashierUser } from '@/lib/rbac';
import type { FinanceAccount, User } from '@/lib/types';

type CashierAccountRow = FinanceAccount & {
  totalIncoming?: number;
  totalOutgoing?: number;
  expectedClosingBalance?: number;
  lastReconciliationAt?: string | null;
};

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
  const [accounts, setAccounts] = useState<CashierAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reconTarget, setReconTarget] = useState<CashierAccountRow | null>(null);
  const [actualBalance, setActualBalance] = useState('');
  const [reconComment, setReconComment] = useState('');
  const [reconError, setReconError] = useState('');
  const [reconSaving, setReconSaving] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const query = params.toString() ? `?${params}` : '';
    Promise.all([
      apiFetch<CashierAccountRow[]>(`/finance/accounts${query}`),
      apiFetch<User>('/auth/me'),
    ])
      .then(([rows, currentUser]) => {
        setAccounts(rows);
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
  const cashierOnly = isCashierOnlyFinanceUser(user);
  const hqCashierView = isHqCashierUser(user);

  function openReconciliation(account: CashierAccountRow) {
    setReconTarget(account);
    setActualBalance(String(Number(account.expectedClosingBalance ?? account.availableBalance ?? 0)));
    setReconComment('');
    setReconError('');
  }

  async function submitReconciliation(event: FormEvent) {
    event.preventDefault();
    if (!reconTarget || reconSaving) return;
    const expected = Number(reconTarget.expectedClosingBalance ?? reconTarget.availableBalance ?? 0);
    const actual = Number(actualBalance);
    if (!Number.isFinite(actual)) {
      setReconError(t('finance.statementBalance'));
      return;
    }
    const difference = Math.round((actual - expected) * 100) / 100;
    if (Math.abs(difference) > 0.009 && reconComment.trim().length < 3) {
      setReconError(t('finance.reconciliationCommentRequired'));
      return;
    }
    setReconSaving(true);
    setReconError('');
    try {
      await apiFetch('/finance/reconciliations', {
        method: 'POST',
        body: JSON.stringify({
          accountId: reconTarget.id,
          actualBalance: actual,
          notes: reconComment.trim() || undefined,
          statementDate: new Date().toISOString(),
        }),
      });
      setReconTarget(null);
      setActualBalance('');
      setReconComment('');
      load();
    } catch (err) {
      setReconError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setReconSaving(false);
    }
  }

  const expectedForModal = Number(reconTarget?.expectedClosingBalance ?? reconTarget?.availableBalance ?? 0);
  const actualForModal = Number(actualBalance || 0);
  const differenceForModal = Math.round((actualForModal - expectedForModal) * 100) / 100;

  return (
    <FinanceLayout
      titleKey={cashierOnly || hqCashierView ? 'finance.myAccounts' : 'finance.accounts'}
      breadcrumbs={[{ labelKey: cashierOnly || hqCashierView ? 'finance.myAccounts' : 'finance.accounts' }]}
      sectionTabs={cashierOnly || hqCashierView ? undefined : FINANCE_ACCOUNT_TYPE_TABS}
      primaryAction={
        canManage ? (
          <Link href="/finance/accounts/new" className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">
            {t('finance.createAccount')}
          </Link>
        ) : undefined
      }
    >
      {error ? <FinanceErrorState message={error} /> : null}
      {!hqCashierView ? (
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('finance.searchAccounts')}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 md:max-w-md"
        />
      ) : null}
      {loading ? <FinanceLoadingState /> : null}
      {!loading && filtered.length === 0 ? <FinanceEmptyState messageKey="finance.noAccounts" /> : null}
      {!loading && filtered.length > 0 && hqCashierView ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.accountType')}</th>
                <th className="px-4 py-3">{t('finance.availableBalance')}</th>
                <th className="px-4 py-3">{t('finance.openingBalance')}</th>
                <th className="px-4 py-3">{t('finance.totalIncoming')}</th>
                <th className="px-4 py-3">{t('finance.totalOutgoing')}</th>
                <th className="px-4 py-3">{t('finance.expectedClosingBalance')}</th>
                <th className="px-4 py-3">{t('finance.lastReconciliation')}</th>
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
                  <td className="px-4 py-3 text-right">
                    <FinanceMoney amount={Number(account.availableBalance)} currency={account.currency} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FinanceMoney amount={Number(account.openingBalance)} currency={account.currency} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FinanceMoney amount={Number(account.totalIncoming ?? 0)} currency={account.currency} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FinanceMoney amount={Number(account.totalOutgoing ?? 0)} currency={account.currency} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FinanceMoney
                      amount={Number(account.expectedClosingBalance ?? account.availableBalance)}
                      currency={account.currency}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {account.lastReconciliationAt
                      ? new Date(account.lastReconciliationAt).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openReconciliation(account)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {t('finance.reconciliation')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loading && filtered.length > 0 && !hqCashierView ? (
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

      <CenteredDialog
        open={Boolean(reconTarget)}
        title={t('finance.reconciliation')}
        onClose={() => {
          if (reconSaving) return;
          setReconTarget(null);
        }}
      >
        {reconTarget ? (
          <form className="space-y-3" onSubmit={(e) => void submitReconciliation(e)}>
            <div className="text-sm text-slate-600">
              <div><span className="font-semibold">{t('finance.account')}:</span> {reconTarget.name}</div>
              <div>
                <span className="font-semibold">{t('finance.reconciliationDate')}:</span>{' '}
                {new Date().toLocaleString()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>{t('finance.openingBalance')}: <FinanceMoney amount={Number(reconTarget.openingBalance)} currency={reconTarget.currency} /></div>
              <div>{t('finance.totalIncoming')}: <FinanceMoney amount={Number(reconTarget.totalIncoming ?? 0)} currency={reconTarget.currency} /></div>
              <div>{t('finance.totalOutgoing')}: <FinanceMoney amount={Number(reconTarget.totalOutgoing ?? 0)} currency={reconTarget.currency} /></div>
              <div>{t('finance.expectedBalance')}: <FinanceMoney amount={expectedForModal} currency={reconTarget.currency} /></div>
              <div>{t('finance.difference')}: <FinanceMoney amount={differenceForModal} currency={reconTarget.currency} /></div>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">{t('finance.statementBalance')}</span>
              <input
                type="number"
                step="0.01"
                required
                value={actualBalance}
                onChange={(e) => setActualBalance(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">{t('finance.notes')}</span>
              <textarea
                rows={3}
                value={reconComment}
                onChange={(e) => setReconComment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            {reconError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{reconError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={reconSaving}
                onClick={() => setReconTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                {t('common.close')}
              </button>
              <button
                type="submit"
                disabled={reconSaving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {reconSaving ? t('common.saving') : t('finance.reconciliation')}
              </button>
            </div>
          </form>
        ) : null}
      </CenteredDialog>
    </FinanceLayout>
  );
}
