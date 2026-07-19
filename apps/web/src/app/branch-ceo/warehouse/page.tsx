'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchCeoWarehousePanel } from '@/components/branch-ceo/BranchCeoWarehousePanel';

export default function BranchCeoWarehousePage() {
  return (
    <ProtectedShell>
      <section className="space-y-6">
        <BranchCeoWarehousePanel />
      </section>
    </ProtectedShell>
  );
}
