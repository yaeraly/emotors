'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchWarehouseSection } from '@/components/branch-warehouse/BranchWarehouseSection';
import { BranchWarehouseStockContent } from '@/components/branch-warehouse/BranchWarehouseStockContent';

export default function BranchWarehousePage() {
  return (
    <ProtectedShell>
      <section className="space-y-6">
        <BranchWarehouseSection activeTab="warehouse" showHeading={false} />
        <BranchWarehouseStockContent />
      </section>
    </ProtectedShell>
  );
}
