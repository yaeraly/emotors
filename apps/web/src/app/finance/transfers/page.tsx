'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLayout,
  FinanceLoadingState,
  FinanceMoney,
} from '@/components/finance/FinanceLayout';
import { FINANCE_TRANSFER_TABS } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import type { FinanceAccount, FinanceTransfer } from '@/lib/types';

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
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ sourceAccountId: '', destinationAccountId: '', amount: '', notes: '' });

  const load = () => {
    const params = status ? `?status=${status}` : '';
    Promise.all([
      apiFetch<FinanceAccount[]>('/finance/accounts'),
      apiFetch<FinanceTransfer[]>(`/finance/transfers${params}`),
    ])
      .then(([accountRows, transferRows]) => {
        setAccounts(accountRows);
        setTransfers(transferRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  };

  useEffect(() => { load(); }, [status, t]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch('/finance/transfers', {
        method: 'POST',
        body: JSON.stringify({
          sourceAccountId: form.sourceAccountId,
          destinationAccountId: form.destinationAccountId,
          amount: Number(form.amount),
          notes: form.notes || undefined,
        }),
      });
      setForm({ sourceAccountId: '', destinationAccountId: '', amount: '', notes: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <FinanceLayout
      titleKey="finance.transfers"
      breadcrumbs={[{ labelKey: 'finance.transfers' }]}
      sectionTabs={FINANCE_TRANSFER_TABS}
      primaryAction={<Link href="/finance/transfers?new=1" className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">{t('finance.createTransfer')}</Link>}
    >
      {error ? <FinanceErrorState message={error} /> : null}
      {isNew ? (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-4">
          <select required value={form.sourceAccountId} onChange={(e) => setForm({ ...form, sourceAccountId: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
            <option value="">{t('finance.sourceAccount')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select required value={form.destinationAccountId} onChange={(e) => setForm({ ...form, destinationAccountId: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-3">
            <option value="">{t('finance.destinationAccount')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={t('finance.amount')} className="rounded-xl border border-slate-300 px-4 py-3" />
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('finance.transfer')}</button>
        </form>
      ) : null}
      {transfers.length === 0 ? <FinanceEmptyState messageKey="finance.noTransfers" /> : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">{t('finance.transferNumber')}</th>
                <th className="px-4 py-3">{t('finance.sourceAccount')}</th>
                <th className="px-4 py-3">{t('finance.destinationAccount')}</th>
                <th className="px-4 py-3">{t('finance.amount')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{transfer.transferNumber}</td>
                  <td className="px-4 py-3">{transfer.sourceAccount.name}</td>
                  <td className="px-4 py-3">{transfer.destinationAccount.name}</td>
                  <td className="px-4 py-3 text-right"><FinanceMoney amount={Number(transfer.amount)} currency={transfer.currency} /></td>
                  <td className="px-4 py-3">{transfer.status}</td>
                  <td className="px-4 py-3">
                    {transfer.status === 'PENDING' ? (
                      <button
                        type="button"
                        className="font-semibold text-blue-600"
                        onClick={async () => {
                          try {
                            await apiFetch(`/finance/transfers/${transfer.id}/approve`, { method: 'POST' });
                            load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : t('common.error'));
                          }
                        }}
                      >
                        {t('finance.approveTransfer')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FinanceLayout>
  );
}
