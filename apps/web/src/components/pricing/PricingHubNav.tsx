'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SectionTopNav } from '@/components/SectionTopNav';
import { apiFetch } from '@/lib/api';
import { canViewPricing } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export type PricingHubTab =
  | 'branches'
  | 'retail'
  | 'wholesale'
  | 'profiles'
  | 'category-policies'
  | 'category-rules'
  | 'product-rules'
  | 'overrides'
  | 'simulation'
  | 'versions';

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
    { id: 'branches', label: t('pricing.tabFranchiseSales') },
    { id: 'retail', label: t('pricing.tabRetail') },
    { id: 'wholesale', label: t('pricing.tabWholesale') },
    { id: 'profiles', label: t('pricing.tabProfiles') },
    { id: 'category-policies', label: t('pricing.tabCategoryPolicies') },
    { id: 'category-rules', label: t('pricing.tabCategoryRules') },
    { id: 'product-rules', label: t('pricing.tabProductRules') },
    { id: 'overrides', label: t('pricing.tabOverrides') },
    { id: 'simulation', label: t('pricing.tabSimulation') },
    { id: 'versions', label: t('pricing.tabVersions') },
  ];

  function setTab(tabId: string) {
    router.push(`/pricing/${tabId}`);
  }

  if (!canViewPricing(user) && user) {
    return null;
  }

  return <SectionTopNav tabs={tabs} activeTab={activeTab} onTabChange={setTab} />;
}
