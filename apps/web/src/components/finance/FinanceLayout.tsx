'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import type { ModuleSectionLink } from '@/components/ModuleSectionNav';
import { useTranslation } from '@/i18n/useTranslation';
import { financeRootHrefForUser, visibleFinanceNavSections } from '@/lib/finance-nav';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';
import { useEffect, useState } from 'react';

export type FinanceBreadcrumb = {
  href?: string;
  labelKey: string;
};

type FinanceLayoutProps = {
  titleKey: string;
  breadcrumbs?: FinanceBreadcrumb[];
  sectionTabs?: ModuleSectionLink[];
  primaryAction?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function FinanceLayout({
  titleKey,
  breadcrumbs = [],
  sectionTabs,
  primaryAction,
  headerActions,
  children,
}: FinanceLayoutProps) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const mainNav = visibleFinanceNavSections(user);
  const financeRootHref = financeRootHrefForUser(user);
  const actions = headerActions ?? primaryAction;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href={financeRootHref} className="font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
                {t('nav.finance')}
              </Link>
            </li>
            {breadcrumbs.map((crumb) => (
              <li key={crumb.labelKey} className="flex items-center gap-1">
                <span>/</span>
                {crumb.href ? (
                  <Link href={crumb.href} className="font-semibold text-blue-600 hover:text-blue-700">
                    {t(crumb.labelKey)}
                  </Link>
                ) : (
                  <span className="font-semibold text-slate-700">{t(crumb.labelKey)}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="text-3xl font-bold text-slate-950">{t(titleKey)}</h2>
          {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
        </div>

        {mainNav.length > 0 ? (
          <ModuleSectionNav sections={mainNav} variant="tabs" />
        ) : null}

        {sectionTabs && sectionTabs.length > 0 ? (
          <ModuleSectionNav sections={sectionTabs} variant="tabs" />
        ) : null}

        {children}
      </section>
    </ProtectedShell>
  );
}

export function FinanceMoney({ amount, currency = 'KGS' }: { amount: number; currency?: string }) {
  return (
    <span className="tabular-nums">
      {amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
    </span>
  );
}

export function FinanceStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE' || status === 'PAID' || status === 'COMPLETED' || status === 'CLOSED'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'PENDING' || status === 'OPEN' || status === 'PARTIAL' || status === 'DEBT'
        ? 'bg-amber-50 text-amber-700'
        : status === 'INACTIVE' || status === 'REJECTED' || status === 'CANCELLED'
          ? 'bg-red-50 text-red-700'
          : 'bg-slate-100 text-slate-700';

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{status}</span>;
}

export function FinanceEmptyState({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
      {t(messageKey)}
    </div>
  );
}

export function FinanceErrorState({ message }: { message: string }) {
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>;
}

export function FinanceLoadingState() {
  const { t } = useTranslation();
  return <p className="text-slate-500">{t('common.loading')}</p>;
}
