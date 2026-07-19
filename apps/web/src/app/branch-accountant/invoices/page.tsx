'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { translateStatus } from '@/lib/translate-status';
import type { AccountantInvoiceWorkflowStatus, BranchAccountantInvoice } from '@/lib/types';

const workflowStatuses: AccountantInvoiceWorkflowStatus[] = [
  'PENDING_ACCOUNTANT_REVIEW',
  'INSTALLMENT_APPROVAL_PENDING',
  'READY_FOR_CASHIER',
  'WAITING_FOR_PAYMENT',
  'PAYMENT_SUBMITTED',
  'PAID',
  'PARTIALLY_PAID',
  'REJECTED',
  'CANCELLED',
];

export default function BranchAccountantInvoicesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<BranchAccountantInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    orderNumber: '',
    workflowStatus: '',
    dateFrom: '',
    dateTo: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.orderNumber.trim()) params.set('orderNumber', filters.orderNumber.trim());
    if (filters.workflowStatus) params.set('workflowStatus', filters.workflowStatus);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    apiFetch<BranchAccountantInvoice[]>(`/branch-accountant/invoices${query}`)
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [query, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchAccountant.section')}</p>
          <h2 className="text-3xl font-bold">{t('branchAccountant.invoicesToPay')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-5">
          <input
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder={t('branchAccountant.searchInvoice')}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <input
            value={filters.orderNumber}
            onChange={(event) => setFilters({ ...filters, orderNumber: event.target.value })}
            placeholder={t('branchAccountant.searchOrder')}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <select
            value={filters.workflowStatus}
            onChange={(event) => setFilters({ ...filters, workflowStatus: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="">{t('common.all')} {t('distribution.status')}</option>
            {workflowStatuses.map((status) => (
              <option key={status} value={status}>
                {translateStatus(t, status, 'branchAccountant')}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="text-lg font-bold text-slate-900">{t('branchAccountant.emptyTitle')}</h3>
              <p className="mt-2 text-sm text-slate-600">{t('branchAccountant.emptyDescription')}</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('branchAccountant.invoiceNo')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.orderNo')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.date')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.positions')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.amount')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.paymentType')}</th>
                  <th className="px-4 py-3">{t('distribution.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="cursor-pointer hover:bg-blue-50"
                    onClick={() => router.push(`/branch-accountant/invoices/${invoice.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/branch-accountant/invoices/${invoice.id}`);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <td className="px-4 py-3 font-bold">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">{invoice.orderNumber ?? invoice.branchPurchaseRequestNumber ?? '—'}</td>
                    <td className="px-4 py-3">{new Date(invoice.issuedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{invoice.itemCount}</td>
                    <td className="px-4 py-3">{formatKgs(invoice.totalAmount)}</td>
                    <td className="px-4 py-3">{paymentTypeLabel(t, invoice.paymentType)}</td>
                    <td className="px-4 py-3">{translateStatus(t, invoice.workflowStatus, 'branchAccountant')}</td>
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

function paymentTypeLabel(t: (key: string) => string, paymentType?: string | null) {
  if (!paymentType) return '—';
  const key = `branchAccountant.paymentType.${paymentType}`;
  const translated = t(key);
  return translated === key ? paymentType : translated;
}
