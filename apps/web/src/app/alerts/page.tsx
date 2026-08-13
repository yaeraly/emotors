'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { Phase2DataPage } from '@/components/Phase2DataPage';
import { alertsHubSections } from '@/lib/scm-hub-sections';
import { useTranslation } from '@/i18n/useTranslation';

export default function AlertsPage() {
  const { t } = useTranslation();

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('app.name')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('operations.alerts')}</h2>
        </div>
        <ModuleSectionNav sections={alertsHubSections} />
        <Phase2DataPage
          titleKey="operations.alerts"
          endpoint="/alerts"
          createEndpoint="/alerts"
          defaultPayload={{ branchId: '', type: 'LOW_STOCK', title: '', message: '' }}
          embedded
        />
      </section>
    </ProtectedShell>
  );
}
