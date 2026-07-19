'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchCeoWarehousePanel } from '@/components/branch-ceo/BranchCeoWarehousePanel';
import { BranchCeoWarehouseSection } from '@/components/branch-ceo/BranchCeoWarehouseSection';

export default function BranchCeoWarehousePage() {
  return (
    <ProtectedShell>
      <section className="space-y-6">
        <BranchCeoWarehouseSection />
        <BranchCeoWarehousePanel showHeader={false} />
      </section>
    </ProtectedShell>
  );
}
