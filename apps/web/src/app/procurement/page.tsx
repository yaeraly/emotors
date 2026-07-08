'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementHubNav } from '@/components/procurement/ProcurementHubNav';
import {
  FactoriesListPanel,
  ProcurementOrdersListPanel,
  SuppliersListPanel,
  TransportCompaniesListPanel,
} from '@/components/procurement/ProcurementListPanels';
import { apiFetch } from '@/lib/api';
import { canViewProcurement, canViewTransportCompany } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProcurementTab = 'suppliers' | 'factories' | 'transport' | 'orders' | 'difference-acts';

export default function ProcurementPage() {
  return (
    <Suspense
      fallback={
        <ProtectedShell>
          <p className="p-6 text-slate-500">...</p>
        </ProtectedShell>
      }
    >
      <ProcurementPageContent />
    </Suspense>
  );
}

function ProcurementPageContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);

  const tabParam = searchParams.get('tab');
  const activeTab: ProcurementTab = useMemo(() => {
    if (tabParam === 'factories' || tabParam === 'transport' || tabParam === 'orders' || tabParam === 'difference-acts') {
      return tabParam;
    }
    return 'suppliers';
  }, [tabParam]);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  const canView = canViewProcurement(user);
  const canViewTransport = canViewTransportCompany(user);

  if (!canView) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('procurement.title')}</h2>
        </div>

        <ProcurementHubNav activeTab={activeTab} />

        {activeTab === 'suppliers' ? <SuppliersListPanel /> : null}
        {activeTab === 'factories' ? <FactoriesListPanel /> : null}
        {activeTab === 'transport' && canViewTransport ? <TransportCompaniesListPanel /> : null}
        {activeTab === 'orders' ? <ProcurementOrdersListPanel /> : null}
      </section>
    </ProtectedShell>
  );
}
