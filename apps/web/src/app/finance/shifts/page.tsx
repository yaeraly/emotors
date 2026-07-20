'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { FINANCE_SHIFT_TABS, isCashierOnlyFinanceUser } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { CashierShift, FinanceAccount, User } from '@/lib/types';

export default function FinanceShiftsPage() {
  return (
    <Suspense fallback={null}>
      <FinanceShiftsPageContent />
    </Suspense>
  );
}

function FinanceShiftsPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [error, setError] = useState('');
  const [openForm, setOpenForm] = useState({ accountId: '', openingBalance: '' });
  const [closeForm, setCloseForm] = useState({ shiftId: '', actualBalance: '' });

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const status = searchParams.get('status');
    const mine = searchParams.get('mine');
    if (mine === '1' || (!status && !searchParams.get('differences'))) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('mine');
      if (!status && !searchParams.get('differences')) {
        params.set('status', 'OPEN');
      }
      router.replace(`/finance/shifts?${params.toString()}`);
    }
  }, [router, searchParams]);

  const load = () => {
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<CashierShift[]>('/finance/shifts'),
    ])
      .then(([accountRows, shiftRows]) => {
        setAccounts(accountRows);
        let rows = shiftRows;
        const status = searchParams.get('status');
        if (status) rows = rows.filter((s) => s.status === status);
        if (searchParams.get('differences') === '1') rows = rows.filter((s) => s.difference != null && Number(s.difference) !== 0);
        setShifts(rows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  };

  useEffect(() => { load(); }, [searchParams, t]);

  const onOpen = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/shifts/open', { method: 'POST', body: JSON.stringify({ accountId: openForm.accountId, openingBalance: Number(openForm.openingBalance) }) });
      setOpenForm({ accountId: '', openingBalance: '' });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  };

  const onClose = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch(`/finance/shifts/${closeForm.shiftId}/close`, { method: 'POST', body: JSON.stringify({ actualBalance: Number(closeForm.actualBalance) }) });
      setCloseForm({ shiftId: '', actualBalance: '' });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  };

  return (
    <FinanceLayout
      titleKey={isCashierOnlyFinanceUser(user) ? 'finance.myShifts' : 'finance.shifts'}
      breadcrumbs={[{ labelKey: isCashierOnlyFinanceUser(user) ? 'finance.myShifts' : 'finance.shifts' }]}
      sectionTabs={FINANCE_SHIFT_TABS}
    >
      {error ? <FinanceErrorState message={error} /> : null}
      <form onSubmit={onOpen} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
        <select required value={openForm.accountId} onChange={(e) => setOpenForm({ ...openForm, accountId: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
          <option value="">{t('finance.account')}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input required type="number" min="0" step="0.01" value={openForm.openingBalance} onChange={(e) => setOpenForm({ ...openForm, openingBalance: e.target.value })} placeholder={t('finance.openingBalance')} className="rounded-xl border border-slate-300 px-4 py-3" />
        <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('finance.openShift')}</button>
      </form>
      <form onSubmit={onClose} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
        <select required value={closeForm.shiftId} onChange={(e) => setCloseForm({ ...closeForm, shiftId: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
          <option value="">{t('finance.openShift')}</option>
          {shifts.filter((s) => s.status === 'OPEN').map((s) => <option key={s.id} value={s.id}>{s.shiftNumber}</option>)}
        </select>
        <input required type="number" min="0" step="0.01" value={closeForm.actualBalance} onChange={(e) => setCloseForm({ ...closeForm, actualBalance: e.target.value })} placeholder={t('finance.actualBalance')} className="rounded-xl border border-slate-300 px-4 py-3" />
        <button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">{t('finance.closeShift')}</button>
      </form>
      {shifts.length === 0 ? <FinanceEmptyState messageKey="finance.noShifts" /> : (
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
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(shift.openingBalance)} currency={shift.account.currency} /></td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(shift.expectedBalance)} currency={shift.account.currency} /></td>
                  <td className="px-4 py-3 text-right">{shift.actualBalance != null ? <FinanceMoney amount={Number(shift.actualBalance)} currency={shift.account.currency} /> : '—'}</td>
                  <td className="px-4 py-3 text-right">{shift.difference != null ? <FinanceMoney amount={Number(shift.difference)} currency={shift.account.currency} /> : '—'}</td>
                  <td className="px-4 py-3">{shift.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FinanceLayout>
  );
}
