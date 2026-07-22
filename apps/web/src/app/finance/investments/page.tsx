'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canCreateOwnerInvestment, canManageFinanceInvestments } from '@/lib/finance-rbac';
import type { FinanceAccount, FinanceInvestment, User } from '@/lib/types';

type InvestmentForm = {
  accountId: string;
  amount: string;
  currency: string;
  investmentDate: string;
  investmentType: string;
  investorOwnerName: string;
  notes: string;
};

const emptyForm = (): InvestmentForm => ({
  accountId: '',
  amount: '',
  currency: 'KGS',
  investmentDate: new Date().toISOString().slice(0, 10),
  investmentType: 'OWNER_INVESTMENT',
  investorOwnerName: '',
  notes: '',
});

export default function FinanceInvestmentsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [investments, setInvestments] = useState<FinanceInvestment[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState<InvestmentForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<FinanceInvestment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinanceInvestment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const canCreate = canCreateOwnerInvestment(user);
  const canManage = canManageFinanceInvestments(user);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'ACTIVE'),
    [accounts],
  );

  const activeTotal = useMemo(
    () =>
      investments
        .filter((row) => !row.deletedAt)
        .reduce((sum, row) => sum + Number(row.amount), 0),
    [investments],
  );

  const load = async (includeDeleted = showDeleted) => {
    try {
      const currentUser = user ?? (await apiFetch<User>('/auth/me'));
      setUser(currentUser);
      const qs =
        includeDeleted && canManageFinanceInvestments(currentUser)
          ? '?includeDeleted=true'
          : '';
      const [accountRows, investmentRows] = await Promise.all([
        apiFetch<FinanceAccount[]>('/finance/accounts'),
        apiFetch<FinanceInvestment[]>(`/finance/investments${qs}`),
      ]);
      setAccounts(accountRows);
      setInvestments(investmentRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  useEffect(() => {
    void load(showDeleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, showDeleted]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const startEdit = (investment: FinanceInvestment) => {
    if (investment.deletedAt) return;
    setEditingId(investment.id);
    setViewTarget(null);
    setForm({
      accountId: investment.accountId ?? investment.account?.id ?? '',
      amount: String(investment.amount),
      currency: investment.currency,
      investmentDate: investment.investmentDate.slice(0, 10),
      investmentType: investment.investmentType,
      investorOwnerName: investment.investorOwnerName,
      notes: investment.notes ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      accountId: form.accountId,
      amount: Number(form.amount),
      currency: form.currency,
      investmentDate: form.investmentDate,
      investmentType: form.investmentType,
      investorOwnerName: form.investorOwnerName,
      notes: form.notes || undefined,
    };
    try {
      if (editingId) {
        await apiFetch(`/finance/investments/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/finance/investments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      await load(showDeleted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (reason?: string) => {
    const trimmed = reason?.trim() || '';
    if (!deleteTarget || trimmed.length < 3) {
      setError(t('finance.deleteReasonMinLength') || 'Deletion reason must be at least 3 characters');
      return;
    }
    setDeleting(true);
    setError('');
    try {
      const qs = `?reason=${encodeURIComponent(trimmed)}`;
      await apiFetch(`/finance/investments/${deleteTarget.id}${qs}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: trimmed }),
      });
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) resetForm();
      await load(showDeleted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleting(false);
    }
  };

  const investmentTypeLabel = (type: string) => {
    if (type === 'INVESTOR_INVESTMENT') return t('finance.investorInvestment');
    return t('finance.ownerInvestment');
  };

  const deleteMessage = deleteTarget
    ? `${t('finance.confirmDeleteInvestment')}\n` +
      `${t('finance.amount')}: ${Number(deleteTarget.amount).toLocaleString('ru-RU')} ${deleteTarget.currency}\n` +
      `${t('finance.investmentDate')}: ${new Date(deleteTarget.investmentDate).toLocaleDateString('ru-RU')}\n` +
      `${t('finance.account')}: ${deleteTarget.account?.name ?? '—'}`
    : '';

  return (
    <FinanceLayout titleKey="finance.investments" breadcrumbs={[{ labelKey: 'finance.investments' }]}>
      {error ? <FinanceErrorState message={error} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {t('finance.activeInvestmentTotal')}:{' '}
          <FinanceMoney amount={activeTotal} currency="KGS" />
        </p>
        {canManage ? (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            {t('finance.showDeletedInvestments')}
          </label>
        ) : null}
      </div>

      {canCreate ? (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2 lg:grid-cols-3"
        >
          <div className="md:col-span-2 lg:col-span-3">
            <h3 className="text-base font-bold text-slate-900">
              {editingId ? t('finance.editInvestment') : t('finance.createInvestment')}
            </h3>
          </div>
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
              const account = activeAccounts.find((row) => row.id === e.target.value);
              setForm({
                ...form,
                accountId: e.target.value,
                currency: account?.currency ?? form.currency,
              });
            }}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="">{t('finance.account')}</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {Number(a.currentBalance || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} {a.currency}
              </option>
            ))}
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
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={t('finance.notes')}
            className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2"
          />
          <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
            >
              {editingId ? t('common.save') : t('finance.invest')}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"
              >
                {t('common.cancel')}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {investments.length === 0 ? (
        <FinanceEmptyState messageKey="finance.noInvestments" />
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.investmentDate')}</th>
                <th className="px-4 py-3">{t('finance.investmentType')}</th>
                <th className="px-4 py-3">{t('finance.investorOwnerName')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                <th className="px-4 py-3">{t('finance.createdBy')}</th>
                <th className="px-4 py-3">{t('finance.createdAt')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((investment) => {
                const isDeleted = !!investment.deletedAt;
                return (
                  <tr
                    key={investment.id}
                    className={`border-t border-slate-100 ${isDeleted ? 'bg-slate-50 text-slate-500' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {new Date(investment.investmentDate).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">{investmentTypeLabel(investment.investmentType)}</td>
                    <td className="px-4 py-3">{investment.investorOwnerName}</td>
                    <td className="px-4 py-3">{investment.account?.name}</td>
                    <td className="px-4 py-3 text-right">
                      <FinanceMoney amount={Number(investment.amount)} currency={investment.currency} />
                    </td>
                    <td className="px-4 py-3">
                      {investment.ledgerEntry?.entryNumber ?? investment.investmentNumber}
                    </td>
                    <td className="px-4 py-3">{investment.createdBy?.fullName ?? '—'}</td>
                    <td className="px-4 py-3">
                      {new Date(investment.createdAt).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setViewTarget(investment)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                        >
                          {t('common.view')}
                        </button>
                        {canManage && !isDeleted ? (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(investment)}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(investment)}
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                            >
                              {t('common.delete')}
                            </button>
                          </>
                        ) : null}
                        {isDeleted ? (
                          <span className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
                            {t('finance.deleted')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-950">{t('finance.investmentDetails')}</h3>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-slate-500">{t('finance.investmentDate')}</dt>
                <dd className="font-semibold">
                  {new Date(viewTarget.investmentDate).toLocaleDateString('ru-RU')}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('finance.investmentType')}</dt>
                <dd className="font-semibold">{investmentTypeLabel(viewTarget.investmentType)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('finance.investorOwnerName')}</dt>
                <dd className="font-semibold">{viewTarget.investorOwnerName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('finance.account')}</dt>
                <dd className="font-semibold">{viewTarget.account?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('finance.amount')}</dt>
                <dd className="font-semibold">
                  <FinanceMoney amount={Number(viewTarget.amount)} currency={viewTarget.currency} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('finance.notes')}</dt>
                <dd className="font-semibold">{viewTarget.notes || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('finance.createdBy')}</dt>
                <dd className="font-semibold">{viewTarget.createdBy?.fullName ?? '—'}</dd>
              </div>
              {viewTarget.deletedAt ? (
                <>
                  <div>
                    <dt className="text-slate-500">{t('finance.deletedAt')}</dt>
                    <dd className="font-semibold">
                      {new Date(viewTarget.deletedAt).toLocaleString('ru-RU')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t('common.deleteReason')}</dt>
                    <dd className="font-semibold">{viewTarget.deletionReason || '—'}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              {canManage && !viewTarget.deletedAt ? (
                <button
                  type="button"
                  onClick={() => startEdit(viewTarget)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  {t('common.edit')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DeleteConfirmModal
        open={!!deleteTarget}
        title={t('finance.deleteInvestment')}
        message={deleteMessage}
        requireReason
        minLength={3}
        reasonPlaceholder={t('finance.deleteReasonMinLength')}
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
      />
    </FinanceLayout>
  );
}
