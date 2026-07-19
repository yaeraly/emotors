'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchProductDirectoryListContent } from '@/components/branch-ceo/BranchProductDirectoryListContent';
import { useTranslation } from '@/i18n/useTranslation';

export default function BranchCeoProductDirectoryPage() {
  const { t } = useTranslation();

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('productMaster.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('productMaster.title')}</h2>
          <p className="mt-2 text-slate-500">{t('branchCeo.productDirectorySubtitle')}</p>
        </div>
        <BranchProductDirectoryListContent />
      </section>
    </ProtectedShell>
  );
}
