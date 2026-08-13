'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchCeoWarehouseSection } from '@/components/branch-ceo/BranchCeoWarehouseSection';
import { InventoryCountListContent } from '@/components/inventory/InventoryCountListContent';
import { BRANCH_CEO_WAREHOUSE_INVENTORY_BASE } from '@/lib/branch-ceo-warehouse';

export default function BranchCeoWarehouseInventoryPage() {
  return (
    <ProtectedShell>
      <section className="space-y-6">
        <BranchCeoWarehouseSection showHeading={false} />
        <InventoryCountListContent basePath={BRANCH_CEO_WAREHOUSE_INVENTORY_BASE} />
      </section>
    </ProtectedShell>
  );
}
