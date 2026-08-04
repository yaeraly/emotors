'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { canCreateSale, canDeleteInstallmentDraft, shouldHideSaleProfitColumn, shouldShowSaleStatusColumn } from '@/lib/rbac';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import { canEditDraftSale, draftSaleEditHref } from '@/lib/sale-draft-edit';
import { installmentStatusLabelKey } from '@/lib/sale-installment';
import type { DailySalesReport, PaymentStatus, Sale, SaleStatus, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';

const paymentStatuses: PaymentStatus[] = ['PAID', 'PARTIAL', 'DEBT'];

export default function SalesPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [report, setReport] = useState<DailySalesReport | null>(null);
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hideProfitColumn = shouldHideSaleProfitColumn(user);
  const showSaleStatusColumn = shouldShowSaleStatusColumn(user);
  const showPageTitle = !usesUnifiedNavPageTitle(user);
  const tableColumnCount = (hideProfitColumn ? 9 : 10) + (showSaleStatusColumn ? 1 : 0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set('search', search.trim());
    }
    if (paymentStatus) {
      params.set('paymentStatus', paymentStatus);
    }
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [paymentStatus, search]);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    void loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function loadSales() {
    setLoading(true);
    setError('');

    try {
      const [salesResult, reportResult] = await Promise.all([
        apiFetch<Sale[]>(`/sales${query}`),
        apiFetch<DailySalesReport>('/sales/reports/daily'),
      ]);
      setSales(salesResult);
      setReport(reportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeleteInstallmentDraft() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch(`/sales/${deleteTarget.id}/installment-draft`, { method: 'DELETE' });
      setSales((current) => current.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccess(t('sales.installmentDraftDeleted'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            {showPageTitle ? (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                {t('sales.title')}
              </p>
            ) : null}
            <h2 className="text-3xl font-bold text-slate-950">
              {t('sales.salesAndPayments')}
            </h2>
            <p className="mt-2 text-slate-500">
              {t('sales.payments')}
            </p>
          </div>
          {canCreateSale(user) ? (
            <Link
              href="/sales/new"
              className="rounded-xl bg-blue-600 px-5 py-3 text-center font-semibold text-white hover:bg-blue-700"
            >
              {t('sales.registerSale')}
            </Link>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}

        <div className={`grid gap-4 ${hideProfitColumn ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
          <SummaryCard label={t('sales.dailySales')} value={formatKgs(report?.totalSalesAmount)} />
          <SummaryCard label={t('sales.dailyPaid')} value={formatKgs(report?.totalPaidAmount)} />
          <SummaryCard label={t('sales.dailyDebt')} value={formatKgs(report?.totalDebtAmount)} />
          {!hideProfitColumn ? (
            <SummaryCard label={t('sales.dailyProfit')} value={formatKgs(report?.totalProfitAmount)} />
          ) : null}
        </div>

        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('sales.searchPlaceholder')}
            className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
          />
          <select
            value={paymentStatus}
            onChange={(event) => setPaymentStatus(event.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 outline-none ring-blue-500 focus:ring-2"
          >
            <option value="">{t('common.all')} {t('common.status')}</option>
            {paymentStatuses.map((status) => (
              <option key={status} value={status}>
                {t(`paymentStatus.${status}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="h-[calc(100vh-300px)] min-h-[420px] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className={`divide-y divide-slate-200 text-sm ${hideProfitColumn ? 'min-w-[980px]' : showSaleStatusColumn ? 'min-w-[1120px]' : 'min-w-[1000px]'}`}>
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('sales.receiptNumber')}</th>
                  <th className="px-4 py-3">{t('sales.customer')}</th>
                  <th className="px-4 py-3">{t('crm.phone')}</th>
                  <th className="px-4 py-3">{t('sales.saleDate')}</th>
                  <th className="px-4 py-3">{t('sales.totalAmount')}</th>
                  <th className="px-4 py-3">{t('sales.paidAmount')}</th>
                  <th className="px-4 py-3">{t('sales.debtAmount')}</th>
                  {!hideProfitColumn ? <th className="px-4 py-3">{t('sales.profitAmount')}</th> : null}
                  <th className="px-4 py-3">{t('common.status')}</th>
                  {showSaleStatusColumn ? <th className="px-4 py-3">Sale Status</th> : null}
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-8 text-center text-slate-500">
                      {t('sales.loadingSales')}
                    </td>
                  </tr>
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-8 text-center text-slate-500">
                      {t('sales.noSales')}
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-blue-50/40">
                      <td className="px-4 py-3 font-bold text-blue-700">
                        {sale.receiptNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {sale.customer?.fullName}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {sale.customer?.phone}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(sale.saleDate)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatKgs(sale.totalAmount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {formatKgs(sale.paidAmount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-700">
                        {formatKgs(sale.debtAmount)}
                      </td>
                      {!hideProfitColumn ? (
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {formatKgs(sale.profitAmount)}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <PaymentStatusPill status={sale.paymentStatus} />
                      </td>
                      {showSaleStatusColumn ? (
                        <td className="px-4 py-3">
                          <SaleWorkflowPill sale={sale} />
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/sales/${sale.id}`}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {t('common.open')}
                          </Link>
                          {canEditDraftSale(user, sale) ? (
                            <Link
                              href={draftSaleEditHref(sale.id)}
                              className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              {t('common.edit')}
                            </Link>
                          ) : null}
                          {canDeleteInstallmentDraft(user, sale) ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(sale)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              {t('common.delete')}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        title={t('sales.deleteInstallmentDraftTitle')}
        message={t('sales.deleteInstallmentDraftMessage')}
        confirmButtonLabel={t('common.delete')}
        loading={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={confirmDeleteInstallmentDraft}
      />
    </ProtectedShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  const tone =
    status === 'PAID'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'PARTIAL'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-700';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
      {t(`paymentStatus.${status}`)}
    </span>
  );
}

function SaleWorkflowPill({ sale }: { sale: Sale }) {
  const { t } = useTranslation();
  const installmentKey = installmentStatusLabelKey(sale.installmentApproval?.status);
  if (installmentKey) {
    const rejected =
      sale.installmentApproval?.status === 'REJECTED' ||
      sale.installmentApproval?.status === 'CANCELLED';
    return (
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          rejected ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
        }`}
      >
        {t(installmentKey)}
      </span>
    );
  }
  return <SaleStatusPill status={sale.status} />;
}

function SaleStatusPill({ status }: { status: SaleStatus }) {
  const { t } = useTranslation();
  const tone =
    status === 'FINALIZED'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'CANCELLED'
        ? 'bg-red-100 text-red-700'
        : status === 'SENT_TO_CUSTOMER'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-slate-100 text-slate-600';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
      {getStatusLabel({ module: 'sale', status, t })}
    </span>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} KGS`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
