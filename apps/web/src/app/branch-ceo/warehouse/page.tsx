'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { BranchCeoWarehousePanel } from '@/components/branch-ceo/BranchCeoWarehousePanel';
import { useTranslation } from '@/i18n/useTranslation';

export default function BranchCeoWarehousePage() {
  const { t } = useTranslation();

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.inventory')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branchCeo.warehouseTitle')}</h2>
        </div>
        <BranchCeoWarehousePanel />
      </section>
    </ProtectedShell>
  );
}
