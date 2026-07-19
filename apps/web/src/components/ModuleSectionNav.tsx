'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n/useTranslation';

export type ModuleSectionLink = {
  href: string;
  labelKey: string;
};

type Props = {
  sections: ModuleSectionLink[];
  variant?: 'cards' | 'tabs';
};

function isSectionActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== '/' && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export function ModuleSectionNav({ sections, variant = 'cards' }: Props) {
  const { t } = useTranslation();
  const pathname = usePathname();

  if (variant === 'tabs') {
    return (
      <nav className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {sections.map((section) => {
          const active = isSectionActive(pathname, section.href);
          return (
            <Link
              key={`${section.href}-${section.labelKey}`}
              href={section.href}
              className={
                active
                  ? 'rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700'
                  : 'rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900'
              }
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
      {sections.map((section) => (
        <Link
          key={`${section.href}-${section.labelKey}`}
          href={section.href}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
        >
          {t(section.labelKey)}
        </Link>
      ))}
    </div>
  );
}
