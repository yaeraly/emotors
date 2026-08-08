'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import {
  filterBranchCashierTransferDestinationAccounts,
  formatBranchCashierAccountLabel,
  resolveBranchCashierTransferDestinationId,
} from '@/lib/branch-cashier-receiving-account';
import type { FinanceAccount, FinanceTransfer } from '@/lib/types';

type TransferForm = {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  reason: string;
};

const emptyForm = (): TransferForm => ({
  sourceAccountId: '',
  destinationAccountId: '',
  amount: '',
  reason: '',
});

export default function BranchCashierTransfersPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [form, setForm] = useState<TransferForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'ACTIVE'),
    [accounts],
  );
  const destinationAccounts = useMemo(
    () => filterBranchCashierTransferDestinationAccounts(activeAccounts, form.sourceAccountId),
    [activeAccounts, form.sourceAccountId],
  );

  function updateSourceAccountId(sourceAccountId: string) {
    setForm((current) => ({
      ...current,
      sourceAccountId,
      destinationAccountId: resolveBranchCashierTransferDestinationId(
        current.destinationAccountId,
        sourceAccountId,
      ),
    }));
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [accountData, transferData] = await Promise.all([
        apiFetch<FinanceAccount[]>('/branch-cashier/accounts'),
        apiFetch<FinanceTransfer[]>('/branch-cashier/transfers'),
      ]);
      setAccounts(accountData);
      setTransfers(transferData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(transfer: FinanceTransfer) {
    if (transfer.status !== 'PENDING' && transfer.status !== 'REJECTED') return;
    setEditingId(transfer.id);
    setForm({
      sourceAccountId: transfer.sourceAccount.id,
      destinationAccountId: transfer.destinationAccount.id,
      amount: String(transfer.amount),
      reason: transfer.reason ?? '',
    });
    setSuccess('');
    setError('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        amount: Number(form.amount),
        reason: form.reason.trim(),
      };
      if (editingId) {
        await apiFetch(`/branch-cashier/transfers/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setSuccess(t('branchCashier.transferUpdated'));
      } else {
        await apiFetch('/branch-cashier/transfers', {
          method: 'POST',
          body: JSON.stringify({ ...payload, idempotencyKey: crypto.randomUUID() }),
        });
        setSuccess(t('branchCashier.transferSubmitted'));
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <h2 className="text-3xl font-bold">{t('branchCashier.accountTransfers')}</h2>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <h3 className="md:col-span-2 text-lg font-bold">
            {editingId ? t('branchCashier.editTransfer') : t('branchCashier.createTransfer')}
          </h3>

          <label className="block">
            <span className="text-sm font-semibold">{t('branchCashier.transferFromAccount')}</span>
            <select
              value={form.sourceAccountId}
              onChange={(e) => updateSourceAccountId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              required
            >
              <option value="">{t('branchCashier.selectAccount')}</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatBranchCashierAccountLabel(account)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">{t('branchCashier.transferToAccount')}</span>
            <select
              value={form.destinationAccountId}
              onChange={(e) => setForm((current) => ({ ...current, destinationAccountId: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              required
            >
              <option value="">{t('branchCashier.selectAccount')}</option>
              {destinationAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatBranchCashierAccountLabel(account)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold">{t('branchCashier.transferAmount')}</span>
            <input
              value={form.amount}
              onChange={(e) => setForm((current) => ({ ...current, amount: e.target.value }))}
              type="number"
              min="0.01"
              step="0.01"
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              required
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold">{t('branchCashier.transferReason')}</span>
            <input
              value={form.reason}
              onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              required
            />
          </label>

          <div className="flex gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {editingId ? t('common.save') : t('branchCashier.submitTransfer')}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-4 py-3 font-semibold"
              >
                {t('common.cancel')}
              </button>
            ) : null}
          </div>
        </form>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
          ) : transfers.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-600">{t('branchCashier.emptyTransfers')}</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                  <th className="px-4 py-3">{t('branchCashier.transferFromAccount')}</th>
                  <th className="px-4 py-3">{t('branchCashier.transferToAccount')}</th>
                  <th className="px-4 py-3">{t('branchCashier.transferAmount')}</th>
                  <th className="px-4 py-3">{t('distribution.status')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td className="px-4 py-3 font-semibold">{transfer.transferNumber}</td>
                    <td className="px-4 py-3">{transfer.sourceAccount.name}</td>
                    <td className="px-4 py-3">{transfer.destinationAccount.name}</td>
                    <td className="px-4 py-3">{formatKgs(transfer.amount)}</td>
                    <td className="px-4 py-3">
                      {t(`finance.transferStatus.${transfer.status}`)}
                    </td>
                    <td className="px-4 py-3">
                      {transfer.status === 'PENDING' || transfer.status === 'REJECTED' ? (
                        <button
                          type="button"
                          onClick={() => startEdit(transfer)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                        >
                          {t('common.edit')}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
