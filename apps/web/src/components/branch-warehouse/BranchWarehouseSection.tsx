'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SectionTopNav } from '@/components/SectionTopNav';
import { useTranslation } from '@/i18n/useTranslation';
import {
  BRANCH_WAREHOUSE_SECTION_BASE,
  BRANCH_WAREHOUSE_INVENTORY_BASE,
} from '@/lib/branch-warehouse-inventory';

type BranchWarehouseSectionTab = 'warehouse' | 'inventory';

type Props = {
  activeTab: BranchWarehouseSectionTab;
  action?: ReactNode;
  showHeading?: boolean;
};

export function BranchWarehouseSection({ activeTab, action, showHeading = true }: Props) {
  const router = useRouter();
  const { t } = useTranslation();

  const tabs = [
    { id: 'warehouse', label: t('branchWarehouseOperator.warehouseTab') },
    { id: 'inventory', label: t('branchWarehouseOperator.inventory') },
  ];

  return (
    <div className="space-y-6">
      {showHeading ? (
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('branchWarehouseOperator.warehouse')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branchWarehouseOperator.warehouseSectionTitle')}</h2>
        </div>
      ) : null}
      <SectionTopNav
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tabId) =>
          router.push(tabId === 'warehouse' ? BRANCH_WAREHOUSE_SECTION_BASE : BRANCH_WAREHOUSE_INVENTORY_BASE)
        }
        action={action}
      />
    </div>
  );
}
