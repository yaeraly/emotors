'use client';

import { ReactNode } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';

export default function PricingLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('pricing.subtitle')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('pricing.title')}</h2>
        </div>
        {children}
      </section>
    </ProtectedShell>
  );
}
