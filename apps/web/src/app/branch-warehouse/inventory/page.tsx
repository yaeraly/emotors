'use client';

import Link from 'next/link';
import { ProtectedShell } from '@/components/ProtectedShell';
import { InventoryCountListContent } from '@/components/inventory/InventoryCountListContent';
import { BRANCH_WAREHOUSE_INVENTORY_BASE, branchWarehouseInventoryPath } from '@/lib/branch-warehouse-inventory';
import { canManageInventoryCount } from '@/lib/rbac';
import { useTranslation } from '@/i18n/useTranslation';
import { useEffect, useState } from 'react';
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
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('branchWarehouseOperator.inventory')}
            </p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('inventoryCount.title')}</h2>
          </div>
          {canManageInventoryCount(user) ? (
            <Link
              href={branchWarehouseInventoryPath('new')}
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              {t('inventoryCount.newInventory')}
            </Link>
          ) : null}
        </div>
        <InventoryCountListContent basePath={BRANCH_WAREHOUSE_INVENTORY_BASE} hideFinancials />
      </section>
    </ProtectedShell>
  );
}
