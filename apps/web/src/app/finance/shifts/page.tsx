'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { CashierShift, FinanceAccount } from '@/lib/types';

export default function FinanceShiftsPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [error, setError] = useState('');
  const [openForm, setOpenForm] = useState({ accountId: '', openingBalance: '' });
  const [closeForm, setCloseForm] = useState({ shiftId: '', actualBalance: '' });

  const load = () => {
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<CashierShift[]>('/finance/shifts'),
    ])
      .then(([accountRows, shiftRows]) => {
        setAccounts(accountRows);
        setShifts(shiftRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  };

  useEffect(() => {
    load();
  }, [t]);

  const onOpen = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/shifts/open', {
        method: 'POST',
        body: JSON.stringify({
          accountId: openForm.accountId,
          openingBalance: Number(openForm.openingBalance),
        }),
      });
      setOpenForm({ accountId: '', openingBalance: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const onClose = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch(`/finance/shifts/${closeForm.shiftId}/close`, {
        method: 'POST',
        body: JSON.stringify({ actualBalance: Number(closeForm.actualBalance) }),
      });
      setCloseForm({ shiftId: '', actualBalance: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/finance" className="text-sm font-semibold text-blue-600">{t('nav.finance')}</Link>
          <h2 className="text-3xl font-bold">{t('finance.shifts')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <form onSubmit={onOpen} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
          <select
            value={openForm.accountId}
            onChange={(event) => setOpenForm({ ...openForm, accountId: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          >
            <option value="">{t('finance.account')}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={openForm.openingBalance}
            onChange={(event) => setOpenForm({ ...openForm, openingBalance: event.target.value })}
            placeholder={t('finance.openingBalance')}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          />
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">
            {t('finance.openShift')}
          </button>
        </form>

        <form onSubmit={onClose} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
          <select
            value={closeForm.shiftId}
            onChange={(event) => setCloseForm({ ...closeForm, shiftId: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          >
            <option value="">{t('finance.openShift')}</option>
            {shifts.filter((shift) => shift.status === 'OPEN').map((shift) => (
              <option key={shift.id} value={shift.id}>{shift.shiftNumber} — {shift.account.name}</option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={closeForm.actualBalance}
            onChange={(event) => setCloseForm({ ...closeForm, actualBalance: event.target.value })}
            placeholder={t('finance.actualBalance')}
            className="rounded-xl border border-slate-300 px-4 py-3"
            required
          />
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">
            {t('finance.closeShift')}
          </button>
        </form>

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.shiftNumber')}</th>
                <th className="px-4 py-3">{t('finance.account')}</th>
                <th className="px-4 py-3">{t('finance.openingBalance')}</th>
                <th className="px-4 py-3">{t('finance.expectedBalance')}</th>
                <th className="px-4 py-3">{t('finance.actualBalance')}</th>
                <th className="px-4 py-3">{t('finance.difference')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{shift.shiftNumber}</td>
                  <td className="px-4 py-3">{shift.account.name}</td>
                  <td className="px-4 py-3">{Number(shift.openingBalance).toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-3">{Number(shift.expectedBalance).toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-3">{shift.actualBalance != null ? Number(shift.actualBalance).toLocaleString('ru-RU') : '—'}</td>
                  <td className="px-4 py-3">{shift.difference != null ? Number(shift.difference).toLocaleString('ru-RU') : '—'}</td>
                  <td className="px-4 py-3">{shift.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
