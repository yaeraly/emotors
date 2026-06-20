'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { DailySalesReport, PaymentStatus, Sale, SaleStatus } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const paymentStatuses: PaymentStatus[] = ['PAID', 'PARTIAL', 'DEBT'];

export default function SalesPage() {
  const { t } = useTranslation();
  const [sales, setSales] = useState<Sale[]>([]);
  const [report, setReport] = useState<DailySalesReport | null>(null);
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setError(err instanceof Error ? err.message : 'Could not load sales');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('sales.title')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">
              {t('sales.salesAndPayments')}
            </h2>
            <p className="mt-2 text-slate-500">
              {t('sales.payments')}
            </p>
          </div>
          <Link
            href="/sales/new"
            className="rounded-xl bg-blue-600 px-5 py-3 text-center font-semibold text-white hover:bg-blue-700"
          >
            {t('sales.newSale')}
          </Link>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label={t('sales.dailySales')} value={formatKgs(report?.totalSalesAmount)} />
          <SummaryCard label={t('sales.dailyPaid')} value={formatKgs(report?.totalPaidAmount)} />
          <SummaryCard label={t('sales.dailyDebt')} value={formatKgs(report?.totalDebtAmount)} />
          <SummaryCard label={t('sales.dailyProfit')} value={formatKgs(report?.totalProfitAmount)} />
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
            <table className="min-w-[1120px] divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('sales.receiptNumber')}</th>
                  <th className="px-4 py-3">{t('sales.customer')}</th>
                  <th className="px-4 py-3">{t('crm.phone')}</th>
                  <th className="px-4 py-3">{t('sales.saleDate')}</th>
                  <th className="px-4 py-3">{t('sales.totalAmount')}</th>
                  <th className="px-4 py-3">{t('sales.paidAmount')}</th>
                  <th className="px-4 py-3">{t('sales.debtAmount')}</th>
                  <th className="px-4 py-3">{t('sales.profitAmount')}</th>
                  <th className="px-4 py-3">{t('common.status')}</th>
                  <th className="px-4 py-3">Sale Status</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                      {t('sales.loadingSales')}
                    </td>
                  </tr>
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
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
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatKgs(sale.profitAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusPill status={sale.paymentStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <SaleStatusPill status={sale.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/sales/${sale.id}`}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {t('common.open')}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
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

function SaleStatusPill({ status }: { status: SaleStatus }) {
  const labels: Record<SaleStatus, string> = {
    DRAFT: 'Draft',
    SENT_TO_CUSTOMER: 'Sent',
    APPROVED_BY_CUSTOMER: 'Approved',
    FINALIZED: 'Finalized',
    CANCELLED: 'Cancelled',
  };
  const tone =
    status === 'FINALIZED'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'CANCELLED'
        ? 'bg-red-100 text-red-700'
        : status === 'APPROVED_BY_CUSTOMER'
          ? 'bg-amber-100 text-amber-800'
          : status === 'SENT_TO_CUSTOMER'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-slate-100 text-slate-600';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
      {labels[status]}
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
