'use client';

import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { HqSalesBranchOrdersNav } from './HqSalesBranchOrdersNav';

type Props = {
  children: ReactNode;
  actions?: ReactNode;
};

export function HqSalesBranchOrdersSection({ children, actions }: Props) {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.hqBranchOrders')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('operations.hqBranchRequests')}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('operations.hqBranchOrdersIntro')}</p>
        </div>
        {actions}
      </div>
      <HqSalesBranchOrdersNav />
      {children}
    </section>
  );
}
