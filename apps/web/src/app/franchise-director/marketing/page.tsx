'use client';

import { useEffect, useState } from 'react';
import { FranchiseDirectorShell } from '@/components/franchise-director/FranchiseDirectorShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type MarketingResponse = {
  campaigns: Array<{ id: string; title: string; description?: string | null; isActive: boolean; startsAt?: string | null; endsAt?: string | null }>;
  promotions: Array<{ id: string; title: string; isActive: boolean; discountText?: string | null }>;
  activeCampaigns: Array<{ id: string; title: string }>;
};

export default function FranchiseDirectorMarketingPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<MarketingResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<MarketingResponse>('/franchise-director/marketing')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <FranchiseDirectorShell titleKey="franchiseDirector.marketing">
      <p className="text-sm text-slate-500">{t('franchiseDirector.marketingReadOnly')}</p>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('franchiseDirector.activeCampaigns')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.activeCampaigns.map((row) => (
                <li key={row.id} className="rounded-xl border border-slate-100 px-3 py-2 font-semibold">{row.title}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t('franchiseDirector.campaignPerformance')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.campaigns.map((row) => (
                <li key={row.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <p className="font-semibold">{row.title}</p>
                  <p className="text-slate-500">{row.isActive ? t('common.active') : t('common.inactive')}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-bold">{t('franchiseDirector.leadGeneration')}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
              {data.promotions.map((row) => (
                <li key={row.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <p className="font-semibold">{row.title}</p>
                  <p className="text-slate-500">{row.discountText ?? '-'}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </FranchiseDirectorShell>
  );
}
