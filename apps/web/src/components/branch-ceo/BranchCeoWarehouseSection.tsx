'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SectionTopNav } from '@/components/SectionTopNav';
import { useTranslation } from '@/i18n/useTranslation';
import {
  BRANCH_CEO_WAREHOUSE_BASE,
  BRANCH_CEO_WAREHOUSE_INVENTORY_BASE,
} from '@/lib/branch-ceo-warehouse';

type BranchCeoWarehouseSectionTab = 'warehouse' | 'inventory';

type Props = {
  activeTab: BranchCeoWarehouseSectionTab;
  action?: ReactNode;
};

export function BranchCeoWarehouseSection({ activeTab, action }: Props) {
  const router = useRouter();
  const { t } = useTranslation();

  const tabs = [
    { id: 'warehouse', label: t('branchWarehouseOperator.warehouseTab') },
    { id: 'inventory', label: t('branchWarehouseOperator.inventory') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
          {t('hqWarehouse.title')}
        </p>
        <h2 className="text-3xl font-bold text-slate-950">{t('branchCeo.warehouseTitle')}</h2>
        <p className="mt-2 text-slate-500">{t('branchCeo.warehouseDescription')}</p>
      </div>
      <SectionTopNav
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tabId) =>
          router.push(tabId === 'warehouse' ? BRANCH_CEO_WAREHOUSE_BASE : BRANCH_CEO_WAREHOUSE_INVENTORY_BASE)
        }
        action={action}
      />
    </div>
  );
}
