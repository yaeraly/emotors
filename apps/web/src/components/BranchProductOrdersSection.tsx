'use client';

import type { ReactNode } from 'react';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { branchPurchaseRequestsTitleKey } from '@/lib/distribution-labels';
import { visibleBranchProductOrdersNavSections } from '@/lib/branch-product-orders-nav';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  user: User | null;
  children: ReactNode;
  actions?: ReactNode;
  /** Raw page title (e.g. request number on detail view). */
  title?: string;
  /** Override the large page title translation key. */
  titleKey?: string;
  /** Override the blue uppercase label above the title. */
  subtitleKey?: string;
};

/**
 * Branch Sales «Заказ товаров» shell: section tabs carry list-page titles; detail pages pass `title`.
 */
export function BranchProductOrdersSection({
  user,
  children,
  actions,
  title,
  titleKey = 'operations.branchPurchaseRequests',
  subtitleKey,
}: Props) {
  const { t } = useTranslation();
  const navSections = visibleBranchProductOrdersNavSections(user);
  const resolvedSubtitleKey = subtitleKey ?? branchPurchaseRequestsTitleKey(user);
  const showPageHeader = Boolean(title);

  return (
    <section className="space-y-6">
      {showPageHeader || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {showPageHeader ? (
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(resolvedSubtitleKey)}</p>
              <h2 className="text-3xl font-bold text-slate-950">{title ?? t(titleKey)}</h2>
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {navSections.length >= 2 ? <ModuleSectionNav sections={navSections} variant="tabs" /> : null}
      {children}
    </section>
  );
}
