'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SectionTopNav } from '@/components/SectionTopNav';
import {
  FactoriesListPanel,
  ProcurementOrdersListPanel,
  SuppliersListPanel,
  TransportCompaniesListPanel,
  useProcurementCreateAction,
} from '@/components/procurement/ProcurementListPanels';
import { apiFetch } from '@/lib/api';
import { canViewProcurement, canViewTransportCompany } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProcurementTab = 'suppliers' | 'factories' | 'transport' | 'orders';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);

  const tabParam = searchParams.get('tab');
  const activeTab: ProcurementTab = useMemo(() => {
    if (tabParam === 'factories' || tabParam === 'transport' || tabParam === 'orders') return tabParam;
    return 'suppliers';
  }, [tabParam]);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  const canView = canViewProcurement(user);
  const canViewTransport = canViewTransportCompany(user);

  const tabs = useMemo(() => {
    const items = [
      { id: 'suppliers', label: t('procurement.suppliers.title') },
      { id: 'factories', label: t('procurement.factories.title') },
    ];
    if (canViewTransport) {
      items.push({ id: 'transport', label: t('procurement.transportCompanies.title') });
    }
    items.push({ id: 'orders', label: t('procurement.orders.title') });
    return items;
  }, [canViewTransport, t]);

  const createAction = useProcurementCreateAction(activeTab, user, t);

  function setTab(tabId: string) {
    router.replace(`/procurement?tab=${tabId}`);
  }

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

        <SectionTopNav
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setTab}
          action={
            createAction ? (
              <Link href={createAction.href} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
                {createAction.label}
              </Link>
            ) : null
          }
        />

        {activeTab === 'suppliers' ? <SuppliersListPanel /> : null}
        {activeTab === 'factories' ? <FactoriesListPanel /> : null}
        {activeTab === 'transport' && canViewTransport ? <TransportCompaniesListPanel /> : null}
        {activeTab === 'orders' ? <ProcurementOrdersListPanel /> : null}
      </section>
    </ProtectedShell>
  );
}
