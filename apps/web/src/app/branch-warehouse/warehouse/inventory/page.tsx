'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchWarehouseSection } from '@/components/branch-warehouse/BranchWarehouseSection';
import { InventoryCountListContent } from '@/components/inventory/InventoryCountListContent';
import { BRANCH_WAREHOUSE_INVENTORY_BASE, branchWarehouseInventoryPath } from '@/lib/branch-warehouse-inventory';
import { canManageInventoryCount } from '@/lib/rbac';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';

export default function BranchWarehouseInventoryPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <BranchWarehouseSection
          activeTab="inventory"
          action={
            canManageInventoryCount(user) ? (
              <Link
                href={branchWarehouseInventoryPath('new')}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
              >
                {t('inventoryCount.newInventory')}
              </Link>
            ) : null
          }
        />
        <InventoryCountListContent basePath={BRANCH_WAREHOUSE_INVENTORY_BASE} hideFinancials />
      </section>
    </ProtectedShell>
  );
}
