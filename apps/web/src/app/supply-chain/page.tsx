'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { supplyChainHubSections } from '@/lib/scm-hub-sections';
import { useTranslation } from '@/i18n/useTranslation';

export default function SupplyChainPage() {
  const { t } = useTranslation();

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('app.name')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('supplyChain.title')}</h2>
        </div>
        <ModuleSectionNav sections={supplyChainHubSections} />
      </section>
    </ProtectedShell>
  );
}
