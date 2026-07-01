'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';

export type ModuleSectionLink = {
  href: string;
  labelKey: string;
};

type Props = {
  sections: ModuleSectionLink[];
};

export function ModuleSectionNav({ sections }: Props) {
  const { t } = useTranslation();

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
