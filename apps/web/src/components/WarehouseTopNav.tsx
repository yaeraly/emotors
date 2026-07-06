'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { isWarehouseTabActive, visibleWarehouseTabs } from '@/lib/warehouse-nav';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export function WarehouseTopNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const tabs = visibleWarehouseTabs(user);
  if (!tabs.length) return null;

  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {tabs.map((tab) => {
        const active = isWarehouseTabActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm'
                : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700'
            }
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
