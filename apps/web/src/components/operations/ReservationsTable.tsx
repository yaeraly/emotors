'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';
import {
  formatOperationsDate,
  formatOperationsMoney,
  formatOperationsProductSummary,
} from '@/lib/operations-table-utils';

export type ReservationListRow = {
  id: string;
  reservationNumber: string;
  status: string;
  depositAmount: number;
  expiresAt: string;
  convertedSaleId?: string | null;
  totalAmount: number;
  itemCount: number;
  totalUnits: number;
  customer: { id: string; fullName: string; phone: string } | null;
};

type Props = {
  reservations: ReservationListRow[];
  loading: boolean;
  error?: string;
};

const STATUS_TONES: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-800',
  EXPIRED: 'bg-slate-100 text-slate-700',
  CONVERTED_TO_SALE: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function ReservationsTable({ reservations, loading, error }: Props) {
  const { t } = useTranslation();
  const colCount = 8;

  return (
    <>
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-[11%] px-2 py-2.5">{t('operations.reservationColNumber')}</th>
              <th className="w-[18%] px-2 py-2.5">{t('operations.reservationColCustomer')}</th>
              <th className="w-[14%] px-2 py-2.5">{t('operations.reservationColProducts')}</th>
              <th className="w-[11%] px-2 py-2.5">{t('operations.reservationColAmount')}</th>
              <th className="w-[11%] px-2 py-2.5">{t('operations.reservationColPrepayment')}</th>
              <th className="w-[10%] px-2 py-2.5">{t('operations.reservationColUntil')}</th>
              <th className="w-[13%] px-2 py-2.5">{t('common.status')}</th>
              <th className="w-[12%] px-2 py-2.5">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-2 py-8 text-center text-slate-500">
                  {t('operations.reservationLoading')}
                </td>
              </tr>
            ) : reservations.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-2 py-8 text-center text-slate-500">
                  {t('operations.reservationEmpty')}
                </td>
              </tr>
            ) : (
              reservations.map((reservation) => (
                <ReservationDesktopRow key={reservation.id} reservation={reservation} t={t} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {t('operations.reservationLoading')}
          </p>
        ) : reservations.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {t('operations.reservationEmpty')}
          </p>
        ) : (
          reservations.map((reservation) => (
            <ReservationMobileCard key={reservation.id} reservation={reservation} t={t} />
          ))
        )}
      </div>
    </>
  );
}

function ReservationDesktopRow({
  reservation,
  t,
}: {
  reservation: ReservationListRow;
  t: (key: string) => string;
}) {
  const productSummary = formatOperationsProductSummary(t, reservation.itemCount, reservation.totalUnits);
  const statusLabel = getStatusLabel({ module: 'reservation', status: reservation.status, t });
  const tone = STATUS_TONES[reservation.status] ?? 'bg-slate-100 text-slate-700';

  return (
    <tr>
      <td className="truncate px-2 py-2.5 font-semibold text-slate-900" title={reservation.reservationNumber}>
        {reservation.reservationNumber}
      </td>
      <td className="px-2 py-2.5">
        <p className="truncate font-medium text-slate-900" title={reservation.customer?.fullName}>
          {reservation.customer?.fullName ?? '—'}
        </p>
        {reservation.customer?.phone ? (
          <p className="truncate text-xs text-slate-500">{reservation.customer.phone}</p>
        ) : null}
      </td>
      <td className="truncate px-2 py-2.5 text-slate-700" title={productSummary}>
        {productSummary}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 font-medium text-slate-900">
        {formatOperationsMoney(reservation.totalAmount)}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-slate-700">
        {formatOperationsMoney(reservation.depositAmount)}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-slate-700">
        {formatOperationsDate(reservation.expiresAt)}
      </td>
      <td className="px-2 py-2.5">
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-2 py-2.5">
        {reservation.convertedSaleId ? (
          <Link
            href={`/sales/${reservation.convertedSaleId}`}
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

function ReservationMobileCard({
  reservation,
  t,
}: {
  reservation: ReservationListRow;
  t: (key: string) => string;
}) {
  const statusLabel = getStatusLabel({ module: 'reservation', status: reservation.status, t });
  const tone = STATUS_TONES[reservation.status] ?? 'bg-slate-100 text-slate-700';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-950">{reservation.reservationNumber}</p>
          <p className="truncate text-sm text-slate-700">{reservation.customer?.fullName ?? '—'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
          {statusLabel}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-400">{t('operations.reservationColAmount')}</dt>
          <dd className="font-semibold text-slate-900">{formatOperationsMoney(reservation.totalAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">{t('operations.reservationColUntil')}</dt>
          <dd className="font-medium text-slate-800">{formatOperationsDate(reservation.expiresAt)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-400">{t('operations.reservationColProducts')}</dt>
          <dd className="font-medium text-slate-800">
            {formatOperationsProductSummary(t, reservation.itemCount, reservation.totalUnits)}
          </dd>
        </div>
      </dl>
      {reservation.convertedSaleId ? (
        <div className="mt-3">
          <Link
            href={`/sales/${reservation.convertedSaleId}`}
            className="inline-flex rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {t('common.open')}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
