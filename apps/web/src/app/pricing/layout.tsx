'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';

export default function PricingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const tabs = [
    { href: '/pricing/products', label: t('pricing.tabProducts') },
    { href: '/pricing/categories', label: t('pricing.tabCategories') },
  ];

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('pricing.subtitle')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('pricing.title')}</h2>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        {children}
      </section>
    </ProtectedShell>
  );
}
