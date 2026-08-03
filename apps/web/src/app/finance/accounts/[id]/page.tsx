'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
import {
  canApproveFinanceAccountLifecycle,
  canManageFinanceAccounts,
} from '@/lib/finance-rbac';
import { isBranchAccountantUser } from '@/lib/rbac';
import type { FinanceAccount, FinanceLedgerEntry, User } from '@/lib/types';

export default function FinanceAccountDetailsPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<FinanceAccount & { ledgerEntries?: FinanceLedgerEntry[] } | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');

  const reload = () => {
    setLoading(true);
    Promise.all([
      apiFetch<FinanceAccount & { ledgerEntries?: FinanceLedgerEntry[] }>(`/finance/accounts/${params.id}`),
      apiFetch<User>('/auth/me'),
    ])
      .then(([row, currentUser]) => {
        setAccount(row);
        setUser(currentUser);
        setNameDraft(row.name);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, [params.id, t]);

  const canManage = Boolean(user && canManageFinanceAccounts(user));
  const canApproveLifecycle = Boolean(user && canApproveFinanceAccountLifecycle(user));
  const isBranchAccountant = Boolean(user && isBranchAccountantUser(user));
  const canRenameAccount =
    Boolean(user && canManageFinanceAccounts(user)) &&
    Boolean(account) &&
    account?.status !== 'ARCHIVED' &&
    account?.status !== 'ARCHIVE_REQUESTED' &&
    (!isBranchAccountant || (account?.scope === 'BRANCH' && account?.branchId === user?.branchId));
  const status = account?.status;

  async function saveAccountName(event: FormEvent) {
    event.preventDefault();
    if (!account || busy) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      setActionError(t('finance.accountNameRequired'));
      return;
    }
    setBusy(true);
    setActionError('');
    setNameSuccess('');
    try {
      const updated = await apiFetch<FinanceAccount>(`/finance/accounts/${account.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: nextName }),
      });
      setAccount((prev) => (prev ? { ...prev, ...updated } : updated));
      setNameDraft(updated.name);
      setEditingName(false);
      setNameSuccess(t('finance.accountNameUpdated'));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(path: string, method: 'PATCH' | 'POST' | 'DELETE', successRedirect?: boolean) {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      const result = await apiFetch<FinanceAccount>(path, { method });
      if (successRedirect && method === 'DELETE' && (result as { deletedAt?: string | null }).deletedAt) {
        router.push('/finance/accounts');
        return;
      }
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

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
      {searchParams.get('created') === 'zero' ? (
        <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {t('finance.zeroBalanceAccountCreated')}
        </p>
      ) : null}
      {loading ? <FinanceLoadingState /> : null}
      {account ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.balance')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={Number(account.currentBalance)} currency={account.currency} /></p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.availableBalance')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={Number(account.availableBalance)} currency={account.currency} /></p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('finance.pendingBalance')}</p><p className="mt-2 text-2xl font-bold"><FinanceMoney amount={Number(account.pendingBalance)} currency={account.currency} /></p></div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{t('distribution.status')}</p><p className="mt-2"><FinanceStatusBadge status={account.status} /></p></div>
          </div>

          {(canManage || canApproveLifecycle || canRenameAccount) ? (
            <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-4">
              {actionError ? <div className="w-full"><FinanceErrorState message={actionError} /></div> : null}
              {nameSuccess ? (
                <p className="w-full rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{nameSuccess}</p>
              ) : null}
              {canManage && !isBranchAccountant && (status === 'DRAFT' || status === 'BLOCKED' || status === 'INACTIVE') ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(`/finance/accounts/${account.id}/activate`, 'PATCH')}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t('finance.activateAccount')}
                </button>
              ) : null}
              {canManage && !isBranchAccountant && status === 'ACTIVE' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(`/finance/accounts/${account.id}/block`, 'PATCH')}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"
                >
                  {t('finance.blockAccount')}
                </button>
              ) : null}
              {canManage && !isBranchAccountant && status !== 'ARCHIVED' && status !== 'ARCHIVE_REQUESTED' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t('finance.deleteOrArchiveAccountConfirm'))) return;
                    void runAction(`/finance/accounts/${account.id}`, 'DELETE', true);
                  }}
                  className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                >
                  {t('finance.deleteOrArchiveAccount')}
                </button>
              ) : null}
              {canApproveLifecycle && status === 'ARCHIVE_REQUESTED' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(`/finance/accounts/${account.id}/approve-archive`, 'POST')}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t('finance.approveArchive')}
                </button>
              ) : null}
              {canApproveLifecycle && (status === 'ARCHIVED' || status === 'ARCHIVE_REQUESTED') ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(`/finance/accounts/${account.id}/restore`, 'POST')}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {t('finance.restoreAccount')}
                </button>
              ) : null}
            </div>
          ) : null}

          <ModuleSectionNav sections={tabs} variant="tabs" />

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-sm text-slate-500">{t('finance.accountName')}</dt>
                <dd className="mt-1">
                  {canRenameAccount && editingName ? (
                    <form onSubmit={saveAccountName} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        required
                        maxLength={120}
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2 font-semibold outline-none ring-blue-500 focus:ring-2"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={busy}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditingName(false);
                            setNameDraft(account.name);
                            setActionError('');
                          }}
                          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">{account.name}</span>
                      {canRenameAccount ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingName(true);
                            setNameDraft(account.name);
                            setNameSuccess('');
                            setActionError('');
                          }}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
                        >
                          {t('common.edit')}
                        </button>
                      ) : null}
                    </div>
                  )}
                </dd>
              </div>
              <div><dt className="text-sm text-slate-500">{t('finance.accountType')}</dt><dd className="font-semibold">{account.typeDefinition?.name ?? account.typeCode}</dd></div>
              <div><dt className="text-sm text-slate-500">{t('finance.currency')}</dt><dd className="font-semibold">{account.currency}</dd></div>
              <div><dt className="text-sm text-slate-500">{t('finance.accountNumber')}</dt><dd className="font-semibold">{account.accountNumber}</dd></div>
              {account.iban ? <div><dt className="text-sm text-slate-500">{t('finance.iban')}</dt><dd className="font-semibold">{account.iban}</dd></div> : null}
              {account.bankName ? <div><dt className="text-sm text-slate-500">{t('finance.bankName')}</dt><dd className="font-semibold">{account.bankName}</dd></div> : null}
              <div><dt className="text-sm text-slate-500">{t('finance.scope')}</dt><dd className="font-semibold">{account.scope}</dd></div>
              <div><dt className="text-sm text-slate-500">{t('finance.openingBalance')}</dt><dd className="font-semibold"><FinanceMoney amount={Number(account.openingBalance)} currency={account.currency} /></dd></div>
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
