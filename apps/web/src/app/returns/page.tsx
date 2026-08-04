'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ReturnsTable, type ReturnListRow } from '@/components/operations/ReturnsTable';
import { apiFetch } from '@/lib/api';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ReturnsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [returns, setReturns] = useState<ReturnListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const showPageTitle = !usesUnifiedNavPageTitle(user);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    void apiFetch<ReturnListRow[]>('/returns')
      .then(setReturns)
      .catch((err) => setError(err instanceof Error ? err.message : t('operations.returnLoadError')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className={`flex flex-col justify-between gap-4 lg:flex-row lg:items-end${showPageTitle ? '' : ' lg:justify-end'}`}>
          {showPageTitle ? (
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
                {t('nav.sales')}
              </p>
              <h2 className="text-3xl font-bold text-slate-950">{t('operations.returns')}</h2>
            </div>
          ) : null}
          <Link
            href="/returns/new"
            className="inline-flex h-fit items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('operations.createReturn')}
          </Link>
        </div>

        <ReturnsTable returns={returns} loading={loading} error={error} />
      </section>
    </ProtectedShell>
  );
}
