'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { SectionTopNav } from '@/components/SectionTopNav';
import { useProcurementCreateAction } from '@/components/procurement/ProcurementListPanels';
import { apiFetch } from '@/lib/api';
import {
  canViewChinaReceivingActs,
  canViewProcurement,
  canViewTransportCompany,
  hasFullAccess,
  isSupplyChainManagerUser,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export type ProcurementHubTab =
  | 'suppliers'
  | 'factories'
  | 'transport'
  | 'orders'
  | 'purchase-assistant'
  | 'difference-acts';

type Props = {
  activeTab: ProcurementHubTab;
};

export function ProcurementHubNav({ activeTab }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  const canViewTransport = canViewTransportCompany(user);
  const canViewDifferenceActs =
    canViewChinaReceivingActs(user) && (isSupplyChainManagerUser(user) || hasFullAccess(user));

  const tabs = useMemo(() => {
    const items = [
      { id: 'suppliers', label: t('procurement.suppliers.title') },
      { id: 'factories', label: t('procurement.factories.title') },
    ];
    if (canViewTransport) {
      items.push({ id: 'transport', label: t('procurement.transportCompanies.title') });
    }
    items.push({ id: 'orders', label: t('procurement.orders.title') });
    if (isSupplyChainManagerUser(user) || hasFullAccess(user)) {
      items.push({ id: 'purchase-assistant', label: t('procurement.purchaseAssistant.title') });
    }
    if (canViewDifferenceActs) {
      items.push({ id: 'difference-acts', label: t('chinaReceiving.differenceActs') });
    }
    return items;
  }, [canViewDifferenceActs, canViewTransport, t, user]);

  const createAction = useProcurementCreateAction(
    activeTab === 'difference-acts' || activeTab === 'purchase-assistant' ? 'orders' : activeTab,
    user,
    t,
  );

  function setTab(tabId: string) {
    if (tabId === 'difference-acts') {
      router.push('/procurement/difference-acts');
      return;
    }
    if (tabId === 'purchase-assistant') {
      router.push('/procurement/purchase-assistant');
      return;
    }
    router.push(`/procurement?tab=${tabId}`);
  }

  if (!canViewProcurement(user) && user) {
    return null;
  }

  return (
    <SectionTopNav
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setTab}
      action={
        createAction && activeTab !== 'difference-acts' && activeTab !== 'purchase-assistant' ? (
          <Link href={createAction.href} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
            {createAction.label}
          </Link>
        ) : null
      }
    />
  );
}
