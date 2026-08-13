'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type FollowUpRow = {
  id: string;
  title: string;
  description?: string | null;
  dueAt: string;
  status: string;
  customer: { id: string; fullName: string; phone: string };
  createdBy: { id: string; fullName: string; role: string };
};

export default function FollowUpsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const showPageTitle = !usesUnifiedNavPageTitle(user);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    void apiFetch<FollowUpRow[]>('/customers/follow-ups')
      .then(setFollowUps)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          {showPageTitle ? (
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.followUps')}</p>
          ) : null}
          <h2 className="text-3xl font-bold text-slate-950">{t('crm.followUps')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sales.customer')}</th>
                <th className="px-4 py-3">{t('crm.followUps')}</th>
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td>
                </tr>
              ) : followUps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('crm.followUps')}</td>
                </tr>
              ) : (
                followUps.map((followUp) => (
                  <tr key={followUp.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{followUp.customer.fullName}</p>
                      <p className="text-xs text-slate-500">{followUp.customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{followUp.title}</p>
                      {followUp.description ? <p className="text-xs text-slate-500">{followUp.description}</p> : null}
                    </td>
                    <td className="px-4 py-3">{new Date(followUp.dueAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{translateStatus(t, followUp.status)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${followUp.customer.id}`} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
