'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import {
  HqSalesBranchOrdersTabContent,
  HqSalesListEmptyState,
  HqSalesListFilterGrid,
  HqSalesListLoadingState,
  HqSalesListTableCard,
  hqSalesListFilterControlClass,
  hqSalesListTableClass,
  hqSalesListTableHeadClass,
  hqSalesListTableTdClass,
  hqSalesListTableThClass,
} from '@/components/HqSalesListLayout';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const emptyFilters = { search: '', branchId: '', status: '' };
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.branchId) params.set('branchId', filters.branchId);
    if (filters.status) params.set('status', filters.status);
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    setError('');
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
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [query, t]);

  const hqSalesView = isHqSalesManagerUser(user);

  const filtersPanel = (
    <HqSalesListFilterGrid onClear={() => setFilters(emptyFilters)}>
      <input
        value={filters.search}
        onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        placeholder={t('distribution.invoiceNumber')}
        className={hqSalesListFilterControlClass}
      />
      <select
        value={filters.branchId}
        onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}
        className={hqSalesListFilterControlClass}
      >
        <option value="">{t('common.all')} {t('distribution.branch')}</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(event) => setFilters({ ...filters, status: event.target.value })}
        className={hqSalesListFilterControlClass}
      >
        <option value="">{t('common.all')} {t('distribution.status')}</option>
        {statuses.map((status) => (
          <option key={status} value={status}>{translateStatus(t, status, 'distribution')}</option>
        ))}
      </select>
    </HqSalesListFilterGrid>
  );

  const table = (
    <HqSalesListTableCard>
      {loading ? (
        <HqSalesListLoadingState />
      ) : invoices.length === 0 ? (
        <HqSalesListEmptyState message={t('operations.branchPurchaseRequestsEmpty')} />
      ) : (
      <table className={hqSalesListTableClass}>
        <thead className={hqSalesListTableHeadClass}>
          <tr>
            <th className={hqSalesListTableThClass}>{t('distribution.invoiceNumber')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.branch')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.orderNumber')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.receivingNumber')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.totalAmount')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.paidAmount')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.debtAmount')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.status')}</th>
            <th className={hqSalesListTableThClass}>{t('distribution.dueDate')}</th>
            <th className={hqSalesListTableThClass}>{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-slate-50">
              <td className={`${hqSalesListTableTdClass} font-bold`}>{invoice.invoiceNumber}</td>
              <td className={hqSalesListTableTdClass}>{invoice.branch?.name}</td>
              <td className={hqSalesListTableTdClass}>{invoice.distributionOrder?.orderNumber}</td>
              <td className={hqSalesListTableTdClass}>{invoice.goodsReceiving?.receivingNumber}</td>
              <td className={hqSalesListTableTdClass}>{formatKgs(invoice.totalAmount)}</td>
              <td className={hqSalesListTableTdClass}>{formatKgs(invoice.paidAmount)}</td>
              <td className={hqSalesListTableTdClass}>{formatKgs(invoice.debtAmount)}</td>
              <td className={hqSalesListTableTdClass}>{translateStatus(t, invoice.status, 'distribution')}</td>
              <td className={hqSalesListTableTdClass}>{new Date(invoice.dueDate).toLocaleDateString()}</td>
              <td className={hqSalesListTableTdClass}>
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
      )}
    </HqSalesListTableCard>
  );

  const hqSalesContent = (
    <HqSalesBranchOrdersTabContent error={error} filters={filtersPanel}>
      {table}
    </HqSalesBranchOrdersTabContent>
  );

  const content = hqSalesView ? (
    hqSalesContent
  ) : (
    <>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
          {t(distributionModuleTitleKey(null))}
        </p>
        <h2 className="text-3xl font-bold text-slate-950">{t('distribution.invoices')}</h2>
      </div>
      <HqSalesBranchOrdersTabContent error={error} filters={filtersPanel}>
        {table}
      </HqSalesBranchOrdersTabContent>
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
