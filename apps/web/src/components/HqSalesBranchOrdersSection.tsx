'use client';

import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { HqSalesBranchOrdersNav } from './HqSalesBranchOrdersNav';

type Props = {
  children: ReactNode;
  actions?: ReactNode;
};

/**
 * HQ Sales «Заказы филиалов» section shell: title → description → tab navigation → page content.
 */
export function HqSalesBranchOrdersSection({ children, actions }: Props) {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">{t('operations.hqBranchRequests')}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">{t('operations.hqBranchOrdersIntro')}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
      <HqSalesBranchOrdersNav />
      {children}
    </section>
  );
}
