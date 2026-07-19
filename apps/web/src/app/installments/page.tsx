'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { InstallmentsTable, type InstallmentRow } from '@/components/installments/InstallmentsTable';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

export default function InstallmentsPage() {
  const { t } = useTranslation();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<InstallmentRow[]>('/sales/installments?scope=active')
      .then(setInstallments)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('nav.installments')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{t('sales.installmentListTitle')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <InstallmentsTable installments={installments} loading={loading} variant="active" />
      </section>
    </ProtectedShell>
  );
}
