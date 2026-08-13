'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { translateStatus } from '@/lib/translate-status';
import type { BranchAccountantInvoice } from '@/lib/types';

const actionBtnClass =
  'inline-flex rounded border border-slate-300 px-2 py-1 text-xs font-semibold leading-tight text-slate-700 hover:bg-slate-50';

export default function BranchCashierInvoicesPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<BranchAccountantInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const query = useMemo(() => (search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''), [search]);

  useEffect(() => {
    setLoading(true);
    apiFetch<BranchAccountantInvoice[]>(`/branch-cashier/invoices${query}`)
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [query, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <h2 className="text-3xl font-bold">{t('branchCashier.invoicesToPay')}</h2>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('branchAccountant.searchInvoice')} className="w-full rounded-xl border border-slate-300 px-4 py-3 md:max-w-md" />
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
          ) : invoices.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-600">{t('branchCashier.emptyInvoices')}</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('branchAccountant.invoiceNo')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.orderNo')}</th>
                  <th className="px-4 py-3">{t('branchAccountant.amount')}</th>
                  <th className="px-4 py-3">{t('branchCashier.requiredPayment')}</th>
                  <th className="px-4 py-3">{t('distribution.status')}</th>
                  <th className="px-4 py-3">{t('branchCashier.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3 font-bold">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">{invoice.orderNumber ?? '—'}</td>
                    <td className="px-4 py-3">{formatKgs(invoice.totalAmount)}</td>
                    <td className="px-4 py-3">{formatKgs(invoice.requiredPaymentAmount)}</td>
                    <td className="px-4 py-3">{translateStatus(t, invoice.workflowStatus, 'branchAccountant')}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/branch-cashier/invoices/${invoice.id}`}
                        className={actionBtnClass}
                        title={t('common.open')}
                      >
                        {t('branchCashier.actionOpenShort')}
                      </Link>
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
