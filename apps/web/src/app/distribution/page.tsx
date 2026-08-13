'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { HqSalesBranchOrdersNav } from '@/components/HqSalesBranchOrdersNav';
import {
  distributionHubSections,
  hqCashierDistributionHubSections,
  scmDistributionHubSections,
  warehouseManagerDistributionHubSections,
} from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { isHqCashierUser, isHqSalesManagerUser, isSupplyChainManagerUser, isWarehouseManagerUser } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';

export default function DistributionPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then((currentUser) => {
        setUser(currentUser);
        if (isHqSalesManagerUser(currentUser)) {
          router.replace('/branch-purchase-requests');
        }
      })
      .catch(() => null);
  }, [router]);

  if (isHqSalesManagerUser(user)) {
    return (
      <ProtectedShell>
        <main className="flex min-h-[40vh] items-center justify-center text-slate-600">{t('common.loading')}</main>
      </ProtectedShell>
    );
  }

  const sections = isWarehouseManagerUser(user)
    ? warehouseManagerDistributionHubSections
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
          <h2 className="text-3xl font-bold text-slate-950">{t(distributionModuleTitleKey(user))}</h2>
        </div>
        <ModuleSectionNav sections={sections} />
      </section>
    </ProtectedShell>
  );
}
