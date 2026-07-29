'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import { apiFetch } from '@/lib/api';
import { isHqSalesManagerUser } from '@/lib/rbac';
import type { Branch, BranchInvoice, BranchInvoiceStatus, User } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

const statuses: BranchInvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

export default function BranchInvoicesPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<BranchInvoice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [filters, setFilters] = useState({ search: '', branchId: '', status: '' });
  const [error, setError] = useState('');
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.branchId) params.set('branchId', filters.branchId);
    if (filters.status) params.set('status', filters.status);
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [filters]);

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
    Promise.all([
      apiFetch<BranchInvoice[]>(`/distribution/invoices${query}`),
      apiFetch<Branch[]>('/branches'),
    ])
      .then(([invoiceResult, branchResult]) => {
        setInvoices(invoiceResult);
        setBranches(branchResult);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [query, t]);

  const hqSalesView = isHqSalesManagerUser(user);

  const content = (
    <>
      {!hqSalesView ? (
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t(distributionModuleTitleKey(null))}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{t('distribution.invoices')}</h2>
        </div>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
        <input
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder={t('distribution.invoiceNumber')}
          className="rounded-xl border border-slate-300 px-4 py-3"
        />
        <select
          value={filters.branchId}
          onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}
          className="rounded-xl border border-slate-300 px-4 py-3"
        >
          <option value="">{t('common.all')} {t('distribution.branch')}</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          className="rounded-xl border border-slate-300 px-4 py-3"
        >
          <option value="">{t('common.all')} {t('distribution.status')}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>{translateStatus(t, status, 'distribution')}</option>
          ))}
        </select>
      </div>
      <div className="h-[calc(100vh-300px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('distribution.invoiceNumber')}</th>
              <th className="px-4 py-3">{t('distribution.branch')}</th>
              <th className="px-4 py-3">{t('distribution.orderNumber')}</th>
              <th className="px-4 py-3">{t('distribution.receivingNumber')}</th>
              <th className="px-4 py-3">{t('distribution.totalAmount')}</th>
              <th className="px-4 py-3">{t('distribution.paidAmount')}</th>
              <th className="px-4 py-3">{t('distribution.debtAmount')}</th>
              <th className="px-4 py-3">{t('distribution.status')}</th>
              <th className="px-4 py-3">{t('distribution.dueDate')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-4 py-3 font-bold">{invoice.invoiceNumber}</td>
                <td className="px-4 py-3">{invoice.branch?.name}</td>
                <td className="px-4 py-3">{invoice.distributionOrder?.orderNumber}</td>
                <td className="px-4 py-3">{invoice.goodsReceiving?.receivingNumber}</td>
                <td className="px-4 py-3">{formatKgs(invoice.totalAmount)}</td>
                <td className="px-4 py-3">{formatKgs(invoice.paidAmount)}</td>
                <td className="px-4 py-3">{formatKgs(invoice.debtAmount)}</td>
                <td className="px-4 py-3">{translateStatus(t, invoice.status, 'distribution')}</td>
                <td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/distribution/invoices/${invoice.id}`}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                  >
                    {t('common.open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <ProtectedShell>
      {hqSalesView ? (
        <HqSalesBranchOrdersSection>{content}</HqSalesBranchOrdersSection>
      ) : (
        <section className="space-y-6">{content}</section>
      )}
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
