'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchProductDirectoryListContent } from '@/components/branch-ceo/BranchProductDirectoryListContent';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function BranchCeoProductDirectoryPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const showPageTitle = !usesUnifiedNavPageTitle(user);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        {showPageTitle ? (
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('productMaster.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('productMaster.title')}</h2>
            <p className="mt-2 text-slate-500">{t('branchCeo.productDirectorySubtitle')}</p>
          </div>
        ) : (
          <p className="text-slate-500">{t('branchCeo.productDirectorySubtitle')}</p>
        )}
        <BranchProductDirectoryListContent />
      </section>
    </ProtectedShell>
  );
}
