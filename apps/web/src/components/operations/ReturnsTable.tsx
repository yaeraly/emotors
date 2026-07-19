'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';
import {
  formatOperationsDate,
  formatOperationsMoney,
  formatOperationsProductSummary,
} from '@/lib/operations-table-utils';

export type ReturnListRow = {
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  note?: string | null;
  totalAmount: number;
  createdAt: string;
  itemCount: number;
  totalUnits: number;
  customer: { id: string; fullName: string; phone: string } | null;
  sale: { id: string; receiptNumber: string } | null;
};

type Props = {
  returns: ReturnListRow[];
  loading: boolean;
  error?: string;
};

const STATUS_TONES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  UNDER_INSPECTION: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-emerald-100 text-emerald-900',
  EXCHANGED: 'bg-violet-100 text-violet-800',
  CLOSED: 'bg-slate-100 text-slate-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function formatReturnReason(t: (key: string) => string, reason: string, note?: string | null) {
  const label = t(`operations.returnReason.${reason}`);
  const translated = label !== `operations.returnReason.${reason}` ? label : reason.replaceAll('_', ' ');
  if (!note?.trim()) return translated;
  return `${translated}: ${note.trim()}`;
}

function truncateText(value: string, max = 28) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function ReturnsTable({ returns, loading, error }: Props) {
  const { t } = useTranslation();
  const colCount = 9;

  return (
    <>
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-[10%] px-2 py-2.5">{t('operations.returnColNumber')}</th>
              <th className="w-[9%] px-2 py-2.5">{t('operations.returnColReceipt')}</th>
              <th className="w-[16%] px-2 py-2.5">{t('operations.returnColCustomer')}</th>
              <th className="w-[12%] px-2 py-2.5">{t('operations.returnColProducts')}</th>
              <th className="w-[10%] px-2 py-2.5">{t('operations.returnColAmount')}</th>
              <th className="w-[16%] px-2 py-2.5">{t('operations.returnColReason')}</th>
              <th className="w-[9%] px-2 py-2.5">{t('operations.returnColDate')}</th>
              <th className="w-[10%] px-2 py-2.5">{t('common.status')}</th>
              <th className="w-[8%] px-2 py-2.5">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-2 py-8 text-center text-slate-500">
                  {t('operations.returnLoading')}
                </td>
              </tr>
            ) : returns.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-2 py-8 text-center text-slate-500">
                  {t('operations.returnEmpty')}
                </td>
              </tr>
            ) : (
              returns.map((returnOrder) => (
                <ReturnDesktopRow key={returnOrder.id} returnOrder={returnOrder} t={t} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {t('operations.returnLoading')}
          </p>
        ) : returns.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {t('operations.returnEmpty')}
          </p>
        ) : (
          returns.map((returnOrder) => (
            <ReturnMobileCard key={returnOrder.id} returnOrder={returnOrder} t={t} />
          ))
        )}
      </div>
    </>
  );
}

function ReturnDesktopRow({
  returnOrder,
  t,
}: {
  returnOrder: ReturnListRow;
  t: (key: string) => string;
}) {
  const productSummary = formatOperationsProductSummary(
    t,
    returnOrder.itemCount,
    returnOrder.totalUnits,
    'operations.returnProductSummary',
  );
  const reasonText = formatReturnReason(t, returnOrder.reason, returnOrder.note);
  const statusLabel = getStatusLabel({ module: 'return', status: returnOrder.status, t });
  const tone = STATUS_TONES[returnOrder.status] ?? 'bg-slate-100 text-slate-700';

  return (
    <tr>
      <td className="truncate px-2 py-2.5 font-semibold text-slate-900" title={returnOrder.returnNumber}>
        {returnOrder.returnNumber}
      </td>
      <td className="truncate px-2 py-2.5 text-slate-700" title={returnOrder.sale?.receiptNumber}>
        {returnOrder.sale?.receiptNumber ?? '—'}
      </td>
      <td className="px-2 py-2.5">
        <p className="truncate font-medium text-slate-900" title={returnOrder.customer?.fullName}>
          {returnOrder.customer?.fullName ?? '—'}
        </p>
        {returnOrder.customer?.phone ? (
          <p className="truncate text-xs text-slate-500">{returnOrder.customer.phone}</p>
        ) : null}
      </td>
      <td className="truncate px-2 py-2.5 text-slate-700" title={productSummary}>
        {productSummary}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 font-medium text-slate-900">
        {formatOperationsMoney(returnOrder.totalAmount)}
      </td>
      <td className="truncate px-2 py-2.5 text-slate-700" title={reasonText}>
        {truncateText(reasonText)}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-slate-700">
        {formatOperationsDate(returnOrder.createdAt)}
      </td>
      <td className="px-2 py-2.5">
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-2 py-2.5">
        {returnOrder.sale?.id ? (
          <Link
            href={`/sales/${returnOrder.sale.id}`}
            className="inline-flex rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('common.open')}
          </Link>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}

function ReturnMobileCard({
  returnOrder,
  t,
}: {
  returnOrder: ReturnListRow;
  t: (key: string) => string;
}) {
  const reasonText = formatReturnReason(t, returnOrder.reason, returnOrder.note);
  const statusLabel = getStatusLabel({ module: 'return', status: returnOrder.status, t });
  const tone = STATUS_TONES[returnOrder.status] ?? 'bg-slate-100 text-slate-700';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-950">{returnOrder.returnNumber}</p>
          <p className="text-sm text-slate-600">
            {t('operations.returnColReceipt')}: {returnOrder.sale?.receiptNumber ?? '—'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
          {statusLabel}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-slate-400">{t('operations.returnColCustomer')}</dt>
          <dd className="font-medium text-slate-800">{returnOrder.customer?.fullName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">{t('operations.returnColAmount')}</dt>
          <dd className="font-semibold text-slate-900">{formatOperationsMoney(returnOrder.totalAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">{t('operations.returnColDate')}</dt>
          <dd className="font-medium text-slate-800">{formatOperationsDate(returnOrder.createdAt)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-400">{t('operations.returnColReason')}</dt>
          <dd className="font-medium text-slate-800" title={reasonText}>
            {truncateText(reasonText, 64)}
          </dd>
        </div>
      </dl>
      {returnOrder.sale?.id ? (
        <div className="mt-3">
          <Link
            href={`/sales/${returnOrder.sale.id}`}
            className="inline-flex rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {t('common.open')}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
