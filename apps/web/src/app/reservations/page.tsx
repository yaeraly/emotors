'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import {
  ReservationsTable,
  type ReservationListRow,
} from '@/components/operations/ReservationsTable';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function ReservationsPage() {
  const { t } = useTranslation();
  const [reservations, setReservations] = useState<ReservationListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<ReservationListRow[]>('/reservations')
      .then(setReservations)
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('operations.reservationLoadError')),
      )
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('nav.sales')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('operations.reservations')}</h2>
          </div>
          <Link
            href="/reservations/new"
            className="inline-flex h-fit items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('operations.createReservation')}
          </Link>
        </div>

        <ReservationsTable reservations={reservations} loading={loading} error={error} />
      </section>
    </ProtectedShell>
  );
}
