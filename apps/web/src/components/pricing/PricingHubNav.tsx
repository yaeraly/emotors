'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SectionTopNav } from '@/components/SectionTopNav';
import { apiFetch } from '@/lib/api';
import { canViewPricing } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export type PricingHubTab = 'branches' | 'retail' | 'wholesale' | 'history';

type Props = {
  activeTab: PricingHubTab;
};

export function PricingHubNav({ activeTab }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  const tabs = [
    { id: 'branches', label: t('pricing.tabHqToBranch') },
    { id: 'retail', label: t('pricing.tabRetail') },
    { id: 'wholesale', label: t('pricing.tabWholesale') },
    { id: 'history', label: t('pricing.tabHistory') },
  ];

  function setTab(tabId: string) {
    router.push(`/pricing/${tabId}`);
  }

  if (!canViewPricing(user) && user) {
    return null;
  }

  return <SectionTopNav tabs={tabs} activeTab={activeTab} onTabChange={setTab} />;
}
