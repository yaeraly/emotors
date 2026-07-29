'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  isUnifiedNavModuleActive,
  isUnifiedNavPageActive,
  sidebarHrefForModule,
  visibleModulePages,
  type UnifiedNavModule,
} from '@/lib/unified-nav';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  modules: UnifiedNavModule[];
  user: User;
};

function UnifiedSidebarModuleLinksInner({ modules, user }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

  return (
    <>
      {modules.map((module) => {
        const pages = visibleModulePages(module, user);
        const moduleActive = isUnifiedNavModuleActive(pathname, module);
        const parentHref = sidebarHrefForModule(module, user);
        const parentClass = moduleActive
          ? 'block text-sm font-semibold text-blue-700'
          : 'block text-sm font-semibold text-slate-700 hover:text-blue-700';

        if (pages.length < 2) {
          return (
            <Link
              key={module.id}
              href={parentHref}
              className={
                moduleActive
                  ? 'block rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700'
                  : 'block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
              }
            >
              {t(module.labelKey)}
            </Link>
          );
        }

        return (
          <div
            key={module.id}
            className={moduleActive ? 'rounded-xl bg-blue-50 px-3 py-2' : 'rounded-xl px-3 py-2'}
          >
            <Link href={parentHref} className={parentClass}>
              {t(module.labelKey)}
            </Link>
            {moduleActive ? (
              <div className="mt-2 space-y-1 pl-2">
                {pages.map((page) => {
                  const pageActive = isUnifiedNavPageActive(pathname, search, page.href);
                  return (
                    <Link
                      key={page.href}
                      href={page.href}
                      className={
                        pageActive
                          ? 'block text-xs font-semibold text-blue-700'
                          : 'block text-xs font-semibold text-slate-500 hover:text-blue-700'
                      }
                    >
                      {t(page.labelKey)}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function UnifiedSidebarModuleLinks({ modules, user }: Props) {
  return (
    <Suspense fallback={null}>
      <UnifiedSidebarModuleLinksInner modules={modules} user={user} />
    </Suspense>
  );
}
