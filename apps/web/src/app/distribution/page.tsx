'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import {
  distributionHubSections,
  hqCashierDistributionHubSections,
  hqSalesDistributionHubSections,
  scmDistributionHubSections,
  warehouseManagerDistributionHubSections,
} from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { isHqCashierUser, isHqSalesManagerUser, isSupplyChainManagerUser, isWarehouseManagerUser } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function DistributionPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  const sections = isWarehouseManagerUser(user)
    ? warehouseManagerDistributionHubSections
    : isHqSalesManagerUser(user)
      ? hqSalesDistributionHubSections
      : isHqCashierUser(user)
        ? hqCashierDistributionHubSections
        : isSupplyChainManagerUser(user)
          ? scmDistributionHubSections
          : distributionHubSections;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('app.name')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('distribution.title')}</h2>
        </div>
        <ModuleSectionNav sections={sections} />
      </section>
    </ProtectedShell>
  );
}
