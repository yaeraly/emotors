'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { BRANCH_CEO_WAREHOUSE_INVENTORY_BASE } from '@/lib/branch-ceo-warehouse';
import { InventoryCountListContent } from '@/components/inventory/InventoryCountListContent';
import { apiFetch } from '@/lib/api';
import {
  canManageInventoryCount,
  hasFullAccess,
  isBranchOwnerUser,
  isBranchWarehouseOperator,
  isWarehouseManagerUser,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { BRANCH_WAREHOUSE_INVENTORY_BASE } from '@/lib/branch-warehouse-inventory';

export default function InventoryCountPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then((me) => {
        setUser(me);
        if (isBranchWarehouseOperator(me)) {
          router.replace(BRANCH_WAREHOUSE_INVENTORY_BASE);
          return;
        }
        if (isBranchOwnerUser(me)) {
          router.replace(BRANCH_CEO_WAREHOUSE_INVENTORY_BASE);
          return;
        }
        if (isWarehouseManagerUser(me) || hasFullAccess(me)) {
          router.replace('/hq-warehouses?tab=inventory');
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <ProtectedShell>
        <p className="text-slate-500">{t('common.loading')}</p>
      </ProtectedShell>
    );
  }

  const branchScopedView = user && isBranchOwnerUser(user);
  if (!branchScopedView || isBranchWarehouseOperator(user)) {
    return null;
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <Link href="/inventory" className="text-sm font-semibold text-blue-600">
              ← {t('nav.inventory')}
            </Link>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('inventoryCount.title')}</h2>
            {isBranchOwnerUser(user) ? (
              <p className="mt-2 text-slate-500">{t('inventoryCount.submittedForApproval')}</p>
            ) : null}
          </div>
          {canManageInventoryCount(user) ? (
            <Link
              href="/inventory/count/new"
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              {t('inventoryCount.newInventory')}
            </Link>
          ) : null}
        </div>
        <InventoryCountListContent />
      </section>
    </ProtectedShell>
  );
}
