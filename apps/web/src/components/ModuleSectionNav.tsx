'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { isRouteActive, resolveActiveRouteHref, sectionCardClass, sectionTabClass } from '@/lib/nav-matching';

export type ModuleSectionLink = {
  href: string;
  labelKey: string;
};

type Props = {
  sections: ModuleSectionLink[];
  variant?: 'cards' | 'tabs';
};

export function ModuleSectionNav({ sections, variant = 'cards' }: Props) {
  return (
    <Suspense fallback={null}>
      <ModuleSectionNavInner sections={sections} variant={variant} />
    </Suspense>
  );
}

function ModuleSectionNavInner({ sections, variant = 'cards' }: Props) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const activeHref = resolveActiveRouteHref(
    pathname,
    search,
    sections.map((section) => section.href),
  );

  if (variant === 'tabs') {
    return (
      <nav className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Section navigation">
        {sections.map((section) => {
          const active = activeHref === section.href;
          return (
            <Link
              key={`${section.href}-${section.labelKey}`}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={sectionTabClass(active)}
            >
              {t(section.labelKey)}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {sections.map((section) => {
        const active = isRouteActive(pathname, section.href, search);
        return (
          <Link
            key={`${section.href}-${section.labelKey}`}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={sectionCardClass(active)}
          >
            {t(section.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
