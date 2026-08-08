'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import {
  branchCashierInstallmentsColumnWidthClass,
  branchCashierInstallmentsTruncatedCellClass,
  branchCashierInstallmentsTruncatedTooltip,
} from '@/lib/branch-cashier-installments-table-ui';
import type { BranchAccountantInvoice } from '@/lib/types';

type InstallmentScope = 'active' | 'overdue' | 'closed';
type InstallmentDisplayStatus = 'active' | 'overdue' | 'closed';

const thClass = 'px-1.5 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500';
const tdClass = 'px-1.5 py-1.5 align-middle';
const tdMoneyClass = `${tdClass} text-right tabular-nums whitespace-nowrap`;
const actionBtnClass =
  'inline-flex rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-slate-700 hover:bg-slate-50';

export default function BranchCashierInstallmentsPage() {
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
        <h2 className="text-3xl font-bold">{t('branchCashier.installments')}</h2>
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
            <table className="w-full table-fixed divide-y divide-slate-200 text-xs">
              <colgroup>
                <col className={branchCashierInstallmentsColumnWidthClass('invoiceNo')} />
                <col className={branchCashierInstallmentsColumnWidthClass('receipt')} />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[6%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${thClass} ${branchCashierInstallmentsColumnWidthClass('invoiceNo')}`}>
                    {t('branchCashier.colInvoiceNo')}
                  </th>
                  <th className={`${thClass} ${branchCashierInstallmentsColumnWidthClass('receipt')}`}>
                    {t('branchCashier.colReceipt')}
                  </th>
                  <th className={thClass}>{t('branchCashier.colCustomer')}</th>
                  <th className={`${thClass} text-right`}>{t('branchCashier.colAmount')}</th>
                  <th className={`${thClass} text-right`}>{t('branchCashier.colPaid')}</th>
                  <th className={`${thClass} text-right`}>{t('branchCashier.colRemaining')}</th>
                  <th className={`${thClass} text-right`}>{t('branchCashier.colInitialPayment')}</th>
                  <th className={thClass}>{t('branchCashier.colNextPayment')}</th>
                  <th className={thClass}>{t('branchCashier.colTerm')}</th>
                  <th className={thClass}>{t('branchCashier.colStatus')}</th>
                  <th className={thClass}>{t('branchCashier.colLastPayment')}</th>
                  <th className={thClass}>{t('branchCashier.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installments.map((invoice) => {
                  const receipt = resolveReceiptNumber(invoice);
                  const customer = invoice.customerName ?? '—';

                  return (
                    <tr key={invoice.id} className="hover:bg-blue-50/40">
                      <td className={`${tdClass} ${branchCashierInstallmentsTruncatedCellClass} font-bold text-blue-700`}>
                        <InstallmentTruncatedValue value={invoice.invoiceNumber} />
                      </td>
                      <td className={`${tdClass} ${branchCashierInstallmentsTruncatedCellClass}`}>
                        <InstallmentTruncatedValue value={receipt} />
                      </td>
                      <td className={`${tdClass} max-w-0`} title={customer !== '—' ? customer : undefined}>
                        <span className="block truncate">{customer}</span>
                      </td>
                      <td className={tdMoneyClass}>{formatCompactAmount(invoice.totalAmount)}</td>
                      <td className={tdMoneyClass}>{formatCompactAmount(invoice.paidAmount)}</td>
                      <td className={`${tdMoneyClass} font-semibold text-red-700`}>
                        {formatCompactAmount(invoice.remainingAmount)}
                      </td>
                      <td className={tdMoneyClass}>
                        {formatCompactAmount(invoice.initialPayment ?? invoice.retailInstallment?.initialPayment)}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {formatCompactDate(invoice.nextPaymentDate)}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {formatCompactDate(
                          invoice.installmentEndDate ?? invoice.retailInstallment?.dueDate ?? null,
                        )}
                      </td>
                      <td className={tdClass}>
                        <InstallmentStatusBadge invoice={invoice} t={t} />
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {formatCompactDate(invoice.lastPaymentDate)}
                      </td>
                      <td className={tdClass}>
                        <Link
                          href={`/branch-cashier/installments/${invoice.id}`}
                          className={actionBtnClass}
                          title={t('common.open')}
                        >
                          {t('branchCashier.actionOpenShort')}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </ProtectedShell>
  );
}

function InstallmentTruncatedValue({ value }: { value: string }) {
  const tooltip = branchCashierInstallmentsTruncatedTooltip(value);

  return (
    <span
      className="block truncate"
      title={tooltip}
      tabIndex={tooltip ? 0 : undefined}
    >
      {value}
    </span>
  );
}

function InstallmentStatusBadge({
  invoice,
  t,
}: {
  invoice: BranchAccountantInvoice;
  t: (key: string) => string;
}) {
  const status = resolveInstallmentDisplayStatus(invoice);
  const labelKey =
    status === 'closed'
      ? 'branchCashier.installmentStatusClosed'
      : status === 'overdue'
        ? 'branchCashier.installmentStatusOverdue'
        : 'branchCashier.installmentStatusActive';
  const tone =
    status === 'closed'
      ? 'bg-slate-100 text-slate-600'
      : status === 'overdue'
        ? 'bg-red-100 text-red-700'
        : 'bg-emerald-100 text-emerald-700';

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>
      {t(labelKey)}
    </span>
  );
}

function resolveReceiptNumber(invoice: BranchAccountantInvoice) {
  return invoice.saleNumber ?? invoice.saleReceiptNumber ?? invoice.orderNumber ?? '—';
}

function resolveInstallmentDisplayStatus(invoice: BranchAccountantInvoice): InstallmentDisplayStatus {
  const remaining = Number(invoice.remainingAmount ?? 0);
  const isClosed =
    invoice.status === 'PAID' ||
    invoice.retailInstallment?.status === 'PAID' ||
    remaining <= 0.009;

  if (isClosed) return 'closed';
  if (invoice.status === 'OVERDUE') return 'overdue';

  const dueDateRaw = invoice.nextPaymentDate ?? invoice.retailInstallment?.dueDate;
  if (dueDateRaw) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(dueDateRaw);
    dueDay.setHours(0, 0, 0, 0);
    if (dueDay.getTime() < today.getTime()) return 'overdue';
  }

  return 'active';
}

function formatCompactAmount(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function formatCompactDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
