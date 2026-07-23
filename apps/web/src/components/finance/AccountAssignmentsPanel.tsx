'use client';

import { FormEvent, useEffect, useState } from 'react';
import { FinanceErrorState } from '@/components/finance/FinanceLayout';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { canManageFinanceAccounts } from '@/lib/finance-rbac';
import type { FinanceAccount, User } from '@/lib/types';

type CashierEmployee = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

export function AccountAssignmentsPanel({
  account,
  onUpdated,
}: {
  account: FinanceAccount;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<CashierEmployee[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ userId: '', isPrimary: false });

  useEffect(() => {
    const eligiblePath = account.branchId
      ? `/finance/cashier-eligible-employees?branchId=${encodeURIComponent(account.branchId)}`
      : '/finance/cashier-eligible-employees';
    void Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<CashierEmployee[]>(eligiblePath),
    ])
      .then(([currentUser, rows]) => {
        setUser(currentUser);
        setEmployees(rows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [account.branchId, account.id, t]);

  const canManage = user && canManageFinanceAccounts(user);

  const onAssign = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await apiFetch(`/finance/accounts/${account.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          userId: form.userId,
          isPrimary: form.isPrimary,
        }),
      });
      setForm({ userId: '', isPrimary: false });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const onUnassign = async (userId: string) => {
    setError('');
    try {
      await apiFetch(`/finance/accounts/${account.id}/unassign/${userId}`, { method: 'POST' });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  if (!canManage) return null;
  if (
    account.status === 'ARCHIVED' ||
    account.status === 'ARCHIVE_REQUESTED' ||
    account.status === 'BLOCKED' ||
    account.status === 'INACTIVE'
  ) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold">{t('finance.tabAssignments')}</h3>
      {error ? <FinanceErrorState message={error} /> : null}
      <form onSubmit={onAssign} className="grid gap-3 md:grid-cols-3">
        <select
          required
          value={form.userId}
          onChange={(event) => setForm({ ...form, userId: event.target.value })}
          className="rounded-xl border border-slate-300 px-4 py-3 md:col-span-2"
        >
          <option value="">{t('finance.assignCashier')}</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName} ({employee.role})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })}
          />
          {t('finance.primaryAccount')}
        </label>
        <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-3 md:max-w-xs">
          {t('finance.assignAccount')}
        </button>
      </form>
      {account.assignments && account.assignments.length > 0 ? (
        <ul className="space-y-2">
          {account.assignments.map((assignment) => (
            <li key={assignment.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm">
              <div>
                <p className="font-semibold">
                  {assignment.user.fullName}{' '}
                  <span className="font-normal text-slate-500">({assignment.user.role})</span>
                </p>
                <p className="text-slate-500">{assignment.user.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {assignment.isActive === false
                    ? t('finance.assignmentInactive')
                    : t('finance.assignmentActive')}
                  {assignment.startDate
                    ? ` · ${t('finance.assignmentDate')}: ${new Date(assignment.startDate).toLocaleDateString()}`
                    : null}
                  {assignment.endDate
                    ? ` · ${t('finance.unassignmentDate')}: ${new Date(assignment.endDate).toLocaleDateString()}`
                    : null}
                </p>
              </div>
              <button type="button" onClick={() => void onUnassign(assignment.user.id)} className="font-semibold text-red-600">
                {t('finance.removeAssignment')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
