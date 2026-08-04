'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { FINANCE_TRANSFER_TABS } from '@/lib/finance-nav';
import {
  canConfirmFinanceTransfer,
  canPrepareFinanceTransfer,
  canReverseFinanceTransfer,
} from '@/lib/finance-rbac';
import { API_URL, apiFetch, getToken } from '@/lib/api';
import { usesCompactFinanceTransferTable } from '@/lib/finance-transfer-table';
import { useTranslation } from '@/i18n/useTranslation';
import type { FinanceAccount, FinanceTransfer, User } from '@/lib/types';

type TransferForm = {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  transferDate: string;
  reason: string;
  notes: string;
};

const emptyForm = (): TransferForm => ({
  sourceAccountId: '',
  destinationAccountId: '',
  amount: '',
  transferDate: new Date().toISOString().slice(0, 10),
  reason: '',
  notes: '',
});

export default function FinanceTransfersPage() {
  return (
    <Suspense fallback={null}>
      <FinanceTransfersPageContent />
    </Suspense>
  );
}

function FinanceTransfersPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? undefined;
  const isNew = searchParams.get('new') === '1';

  const [user, setUser] = useState<User | null>(null);
  const canPrepare = canPrepareFinanceTransfer(user);
  const canConfirm = canConfirmFinanceTransfer(user);
  const canReverse = canReverseFinanceTransfer(user);
  const compactTable = usesCompactFinanceTransferTable(user);

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TransferForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<FinanceTransfer | null>(null);
  const [confirmForm, setConfirmForm] = useState({ transactionNumber: '', notes: '', transferDate: '' });
  const [returnTarget, setReturnTarget] = useState<FinanceTransfer | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const hqAccounts = useMemo(
    () => accounts.filter((account) => account.scope === 'HQ' && account.status === 'ACTIVE'),
    [accounts],
  );

  const load = (currentUser?: User | null) => {
    const activeUser = currentUser ?? user;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const prepare = canPrepareFinanceTransfer(activeUser);
    const confirm = canConfirmFinanceTransfer(activeUser);
    const transfersPromise =
      confirm && !prepare && status === 'PENDING_CASHIER'
        ? apiFetch<FinanceTransfer[]>('/finance/transfers/cashier-queue')
        : apiFetch<FinanceTransfer[]>(`/finance/transfers${qs}`);
    const accountsPromise = prepare
      ? apiFetch<FinanceAccount[]>('/finance/accounts')
      : Promise.resolve([] as FinanceAccount[]);

    Promise.all([accountsPromise, transfersPromise])
      .then(([accountRows, transferRows]) => {
        setAccounts(accountRows);
        setTransfers(transferRows);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  };

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then((me) => {
        setUser(me);
        load(me);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, t]);

  function openEdit(transfer: FinanceTransfer) {
    setEditingId(transfer.id);
    setForm({
      sourceAccountId: transfer.sourceAccount.id,
      destinationAccountId: transfer.destinationAccount.id,
      amount: String(transfer.amount),
      transferDate: transfer.transferDate.slice(0, 10),
      reason: transfer.reason ?? '',
      notes: transfer.notes ?? '',
    });
  }

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function saveTransfer(sendToCashier: boolean) {
    if (form.sourceAccountId === form.destinationAccountId) {
      setError(t('finance.transferSameAccountError'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        amount: Number(form.amount),
        transferDate: form.transferDate || undefined,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
        sendToCashier,
      };
      if (editingId) {
        await apiFetch(`/finance/transfers/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/finance/transfers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await saveTransfer(false);
  }

  async function sendToCashier(id: string) {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/finance/transfers/${id}/send-to-cashier`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelTransfer(id: string) {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/finance/transfers/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function reverseTransfer(id: string) {
    const reason = window.prompt(t('finance.transferReverseReason'));
    if (!reason || reason.trim().length < 3) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/finance/transfers/${id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(
    transferId: string,
    kind: 'receipt' | 'support',
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = getToken();
    if (!token) return;
    const formData = new FormData();
    formData.append('file', file);
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/finance/transfers/${transferId}/attachments/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitConfirm() {
    if (!confirmTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/finance/transfers/${confirmTarget.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          transactionNumber: confirmForm.transactionNumber || undefined,
          notes: confirmForm.notes || undefined,
          transferDate: confirmForm.transferDate || undefined,
          expectedVersion: confirmTarget.version,
        }),
      });
      setConfirmTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn() {
    if (!returnTarget || returnReason.trim().length < 3) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/finance/transfers/${returnTarget.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ reason: returnReason.trim() }),
      });
      setReturnTarget(null);
      setReturnReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const showForm = canPrepare && (isNew || !!editingId);

  return (
    <FinanceLayout
      titleKey="finance.transfers"
      breadcrumbs={[{ labelKey: 'finance.transfers' }]}
      sectionTabs={FINANCE_TRANSFER_TABS}
      primaryAction={
        canPrepare ? (
          <Link
            href="/finance/transfers?new=1"
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white"
          >
            {t('finance.createTransfer')}
          </Link>
        ) : null
      }
    >
      {error ? <FinanceErrorState message={error} /> : null}

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="mb-6 grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2"
        >
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('finance.sourceAccount')}</span>
            <select
              required
              value={form.sourceAccountId}
              onChange={(e) => setForm({ ...form, sourceAccountId: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">{t('common.select')}</option>
              {hqAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {Number(account.availableBalance).toFixed(2)} {account.currency}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('finance.destinationAccount')}</span>
            <select
              required
              value={form.destinationAccountId}
              onChange={(e) => setForm({ ...form, destinationAccountId: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">{t('common.select')}</option>
              {hqAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {Number(account.availableBalance).toFixed(2)} {account.currency}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('finance.amount')}</span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('finance.transferDate')}</span>
            <input
              type="date"
              value={form.transferDate}
              onChange={(e) => setForm({ ...form, transferDate: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('finance.transferReason')}</span>
            <input
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('finance.comment')}</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </label>
          {editingId ? (
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('finance.transferSupportDocs')}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="mt-2 block w-full text-sm"
                onChange={(e) => void uploadFile(editingId, 'support', e)}
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-800 disabled:opacity-50"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveTransfer(true)}
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
            >
              {t('finance.sendTransferToCashier')}
            </button>
            {editingId || isNew ? (
              <Link href="/finance/transfers" className="rounded-xl border border-slate-300 px-4 py-3 font-semibold">
                {t('common.cancel')}
              </Link>
            ) : null}
          </div>
        </form>
      ) : null}

      {transfers.length === 0 ? (
        <FinanceEmptyState messageKey="finance.noTransfers" />
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                {compactTable ? (
                  <>
                    <th className="px-4 py-3">{t('finance.transferDate')}</th>
                    <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                    <th className="px-4 py-3">{t('finance.sourceAccount')}</th>
                    <th className="px-4 py-3">{t('finance.destinationAccount')}</th>
                    <th className="px-4 py-3">{t('finance.amount')}</th>
                    <th className="px-4 py-3">{t('distribution.status')}</th>
                    <th className="px-4 py-3">{t('common.actions')}</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                    <th className="px-4 py-3">{t('finance.transferDate')}</th>
                    <th className="px-4 py-3">{t('finance.sourceAccount')}</th>
                    <th className="px-4 py-3">{t('finance.destinationAccount')}</th>
                    <th className="px-4 py-3">{t('finance.amount')}</th>
                    <th className="px-4 py-3">{t('distribution.status')}</th>
                    <th className="px-4 py-3">{t('finance.transferAccountant')}</th>
                    <th className="px-4 py-3">{t('finance.transferCashier')}</th>
                    <th className="px-4 py-3">{t('finance.transferReceipt')}</th>
                    <th className="px-4 py-3">{t('finance.transactionNumber')}</th>
                    <th className="px-4 py-3">{t('finance.comment')}</th>
                    <th className="px-4 py-3">{t('common.actions')}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => {
                const editable = transfer.status === 'DRAFT' || transfer.status === 'RETURNED';
                const awaitingCashier =
                  transfer.status === 'PENDING_CASHIER' || transfer.status === 'PENDING';
                return (
                  <tr key={transfer.id} className="border-t border-slate-100 align-top">
                    {compactTable ? (
                      <>
                        <td className="px-4 py-3">{new Date(transfer.transferDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3 font-semibold">{transfer.transferNumber}</td>
                        <td className="max-w-[12rem] truncate px-4 py-3" title={transfer.sourceAccount.name}>
                          {transfer.sourceAccount.name}
                        </td>
                        <td className="max-w-[12rem] truncate px-4 py-3" title={transfer.destinationAccount.name}>
                          {transfer.destinationAccount.name}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <FinanceMoney amount={Number(transfer.amount)} currency={transfer.currency} />
                        </td>
                        <td className="px-4 py-3">{t(`finance.transferStatus.${transfer.status}`)}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/finance/transfers/${transfer.id}`}
                            className="inline-flex rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            {t('common.open')}
                          </Link>
                        </td>
                      </>
                    ) : (
                      <>
                    <td className="px-4 py-3 font-semibold">{transfer.transferNumber}</td>
                    <td className="px-4 py-3">{new Date(transfer.transferDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{transfer.sourceAccount.name}</td>
                    <td className="px-4 py-3">{transfer.destinationAccount.name}</td>
                    <td className="px-4 py-3 text-right">
                      <FinanceMoney amount={Number(transfer.amount)} currency={transfer.currency} />
                    </td>
                    <td className="px-4 py-3">{t(`finance.transferStatus.${transfer.status}`)}</td>
                    <td className="px-4 py-3">
                      {transfer.accountant?.fullName || transfer.createdBy?.fullName || '-'}
                    </td>
                    <td className="px-4 py-3">{transfer.cashier?.fullName || '-'}</td>
                    <td className="px-4 py-3">
                      {transfer.receipts?.length ? (
                        <div className="space-y-1">
                          {transfer.receipts.map((receipt) => (
                            <a
                              key={receipt.id}
                              href={`${API_URL}${receipt.fileUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-blue-700"
                            >
                              {receipt.fileName}
                            </a>
                          ))}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">{transfer.transactionNumber || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs space-y-1">
                        <p>{transfer.notes || transfer.reason || '-'}</p>
                        {transfer.returnReason ? (
                          <p className="text-xs text-amber-800">
                            {t('finance.transferReturnReason')}: {transfer.returnReason}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canPrepare && editable ? (
                          <>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                              onClick={() => openEdit(transfer)}
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700"
                              onClick={() => void sendToCashier(transfer.id)}
                            >
                              {t('finance.sendTransferToCashier')}
                            </button>
                            <label className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                              {t('finance.transferSupportDocs')}
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={(e) => void uploadFile(transfer.id, 'support', e)}
                              />
                            </label>
                            <button
                              type="button"
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                              onClick={() => void cancelTransfer(transfer.id)}
                            >
                              {t('finance.cancelTransfer')}
                            </button>
                          </>
                        ) : null}
                        {canConfirm && awaitingCashier ? (
                          <>
                            <label className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">
                              {t('finance.uploadTransferReceipt')}
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={(e) => void uploadFile(transfer.id, 'receipt', e)}
                              />
                            </label>
                            <button
                              type="button"
                              className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => {
                                setConfirmTarget(transfer);
                                setConfirmForm({
                                  transactionNumber: transfer.transactionNumber ?? '',
                                  notes: transfer.notes ?? '',
                                  transferDate: transfer.transferDate.slice(0, 10),
                                });
                              }}
                            >
                              {t('finance.confirmTransfer')}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-800"
                              onClick={() => {
                                setReturnTarget(transfer);
                                setReturnReason('');
                              }}
                            >
                              {t('finance.returnTransfer')}
                            </button>
                          </>
                        ) : null}
                        {canReverse && transfer.status === 'COMPLETED' ? (
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                            onClick={() => void reverseTransfer(transfer.id)}
                          >
                            {t('finance.reverseTransfer')}
                          </button>
                        ) : null}
                        <Link
                          href={`/finance/transfers/${transfer.id}`}
                          className="inline-flex rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          {t('common.open')}
                        </Link>
                      </div>
                    </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold">{t('finance.confirmTransfer')}</h4>
            <p className="mt-2 text-sm text-slate-500">
              {confirmTarget.transferNumber} · {confirmTarget.sourceAccount.name} →{' '}
              {confirmTarget.destinationAccount.name} ·{' '}
              <FinanceMoney amount={Number(confirmTarget.amount)} currency={confirmTarget.currency} />
            </p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('finance.transactionNumber')}</span>
                <input
                  value={confirmForm.transactionNumber}
                  onChange={(e) => setConfirmForm({ ...confirmForm, transactionNumber: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('finance.transferDate')}</span>
                <input
                  type="date"
                  value={confirmForm.transferDate}
                  onChange={(e) => setConfirmForm({ ...confirmForm, transferDate: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('finance.comment')}</span>
                <textarea
                  value={confirmForm.notes}
                  onChange={(e) => setConfirmForm({ ...confirmForm, notes: e.target.value })}
                  className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <p className="text-sm text-amber-800">{t('finance.transferReceiptRequired')}</p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmTarget(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 font-semibold"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submitConfirm()}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:bg-blue-300"
                >
                  {saving ? t('common.loading') : t('finance.confirmTransfer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {returnTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-bold">{t('finance.returnTransfer')}</h4>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="mt-4 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder={t('finance.transferReturnReason')}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={saving || returnReason.trim().length < 3}
                onClick={() => void submitReturn()}
                className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white disabled:bg-amber-300"
              >
                {saving ? t('common.loading') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FinanceLayout>
  );
}
