'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { InstallmentsTable, type InstallmentRow } from '@/components/installments/InstallmentsTable';
import { apiFetch } from '@/lib/api';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ClosedInstallmentsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const showPageTitle = !usesUnifiedNavPageTitle(user);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    void apiFetch<InstallmentRow[]>('/sales/installments?scope=closed')
      .then(setInstallments)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        {showPageTitle ? (
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('nav.closedInstallments')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('sales.closedInstallmentListTitle')}</h2>
          </div>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <InstallmentsTable installments={installments} loading={loading} variant="closed" />
      </section>
    </ProtectedShell>
  );
}
