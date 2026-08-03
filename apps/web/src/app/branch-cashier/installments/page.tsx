'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { getStatusLabel } from '@/lib/translate-status';
import type { BranchAccountantInvoice } from '@/lib/types';

type InstallmentScope = 'active' | 'overdue' | 'closed';

export default function BranchCashierInstallmentsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [installments, setInstallments] = useState<BranchAccountantInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<InstallmentScope>('active');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('scope', scope);
    if (search.trim()) params.set('search', search.trim());
    return `?${params.toString()}`;
  }, [scope, search]);

  useEffect(() => {
    setLoading(true);
    setError('');
    apiFetch<BranchAccountantInvoice[]>(`/branch-cashier/installments${query}`)
      .then(setInstallments)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [query, t]);

  const tabs: Array<{ id: InstallmentScope; label: string }> = [
    { id: 'active', label: t('branchCashier.installmentTabActive') },
    { id: 'overdue', label: t('branchCashier.installmentTabOverdue') },
    { id: 'closed', label: t('branchCashier.installmentTabClosed') },
  ];

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchCashier.section')}</p>
          <h2 className="text-3xl font-bold">{t('branchCashier.installments')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                scope === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
            <p className="p-10 text-center text-sm text-slate-600">
              {scope === 'closed'
                ? t('branchCashier.emptyClosedInstallments')
                : scope === 'overdue'
                  ? t('branchCashier.emptyOverdueInstallments')
                  : t('branchCashier.emptyInstallments')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('branchAccountant.invoiceNo')}</th>
                    <th className="px-4 py-3">{t('sales.receiptNumber')}</th>
                    <th className="px-4 py-3">{t('sales.customer')}</th>
                    <th className="px-4 py-3">{t('branchAccountant.amount')}</th>
                    <th className="px-4 py-3">{t('sales.paidAmount')}</th>
                    <th className="px-4 py-3">{t('sales.installmentRemainingDebt')}</th>
                    <th className="px-4 py-3">{t('sales.installmentInitialPayment')}</th>
                    <th className="px-4 py-3">{t('branchCashier.nextPaymentDate')}</th>
                    <th className="px-4 py-3">{t('branchCashier.installmentEndDate')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                    <th className="px-4 py-3">{t('branchCashier.lastPaymentDate')}</th>
                    <th className="px-4 py-3">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {installments.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-blue-50/40">
                      <td className="px-4 py-3 font-bold text-blue-700">{invoice.invoiceNumber}</td>
                      <td className="px-4 py-3">
                        {invoice.saleNumber ?? invoice.saleReceiptNumber ?? invoice.orderNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3">{invoice.customerName ?? '—'}</td>
                      <td className="px-4 py-3">{formatKgs(invoice.totalAmount)}</td>
                      <td className="px-4 py-3">{formatKgs(invoice.paidAmount)}</td>
                      <td className="px-4 py-3 font-semibold text-red-700">
                        {formatKgs(invoice.remainingAmount)}
                      </td>
                      <td className="px-4 py-3">
                        {formatKgs(invoice.initialPayment ?? invoice.retailInstallment?.initialPayment)}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.nextPaymentDate
                          ? new Date(invoice.nextPaymentDate).toLocaleDateString('ru-RU')
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.installmentEndDate || invoice.retailInstallment?.dueDate
                          ? new Date(
                              invoice.installmentEndDate ?? invoice.retailInstallment!.dueDate!,
                            ).toLocaleDateString('ru-RU')
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusLabel({
                          module: 'sale',
                          status: invoice.status,
                          t,
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.lastPaymentDate
                          ? new Date(invoice.lastPaymentDate).toLocaleDateString('ru-RU')
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/branch-cashier/installments/${invoice.id}`}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {t('common.open')}
                          </Link>
                          {scope !== 'closed' ? (
                            <button
                              type="button"
                              onClick={() => router.push(`/branch-cashier/installments/${invoice.id}`)}
                              className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              {t('branchCashier.acceptPayment')}
                            </button>
                          ) : null}
                          <Link
                            href={`/branch-cashier/installments/${invoice.id}#payment-history`}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {t('branchCashier.paymentHistory')}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
