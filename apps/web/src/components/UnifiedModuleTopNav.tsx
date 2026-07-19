'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  resolveActiveUnifiedNavPage,
  resolveModuleForPath,
  shouldShowModuleTopNav,
  visibleModulePages,
} from '@/lib/unified-nav';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  user: User | null;
};

function UnifiedModuleTopNavInner({ user }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const module = resolveModuleForPath(pathname, user);
  if (!shouldShowModuleTopNav(module, user) || !module) return null;

  const pages = visibleModulePages(module, user);

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {pages.map((page) => {
        const active = resolveActiveUnifiedNavPage(pathname, search, pages)?.href === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            className={
              active
                ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm'
                : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700'
            }
          >
            {t(page.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export function UnifiedModuleTopNav({ user }: Props) {
  return (
    <Suspense fallback={null}>
      <UnifiedModuleTopNavInner user={user} />
    </Suspense>
  );
}
