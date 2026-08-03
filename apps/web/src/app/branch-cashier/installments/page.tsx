'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { BranchAccountantInvoice } from '@/lib/types';

export default function BranchCashierInstallmentsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [installments, setInstallments] = useState<BranchAccountantInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const query = useMemo(() => (search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''), [search]);

  useEffect(() => {
    setLoading(true);
    apiFetch<BranchAccountantInvoice[]>(`/branch-cashier/installments${query}`)
      .then(setInstallments)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [query, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchCashier.section')}</p>
          <h2 className="text-3xl font-bold">{t('branchCashier.installments')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('branchAccountant.searchInvoice')}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 md:max-w-md"
        />
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
          ) : installments.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-600">{t('branchCashier.emptyInstallments')}</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('branchAccountant.invoiceNo')}</th>
                  <th className="px-4 py-3">{t('sales.customer')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.amount')}</th>
                  <th className="px-4 py-3">{t('sales.paidAmount')}</th>
                  <th className="px-4 py-3">{t('sales.installmentRemainingDebt')}</th>
                  <th className="px-4 py-3">{t('sales.installmentColDueDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installments.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="cursor-pointer hover:bg-blue-50"
                    onClick={() => router.push(`/branch-cashier/installments/${invoice.id}`)}
                    tabIndex={0}
                    role="link"
                  >
                    <td className="px-4 py-3 font-bold">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">{invoice.customerName ?? '—'}</td>
                    <td className="px-4 py-3">{formatKgs(invoice.totalAmount)}</td>
                    <td className="px-4 py-3">{formatKgs(invoice.paidAmount)}</td>
                    <td className="px-4 py-3">{formatKgs(invoice.remainingAmount)}</td>
                    <td className="px-4 py-3">
                      {invoice.nextPaymentDate
                        ? new Date(invoice.nextPaymentDate).toLocaleDateString('ru-RU')
                        : '—'}
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
