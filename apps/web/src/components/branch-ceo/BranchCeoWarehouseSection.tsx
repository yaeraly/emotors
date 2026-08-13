'use client';

import { useTranslation } from '@/i18n/useTranslation';

type Props = {
  showHeading?: boolean;
};

export function BranchCeoWarehouseSection({ showHeading = true }: Props) {
  const { t } = useTranslation();

  if (!showHeading) {
    return null;
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
        {t('hqWarehouse.title')}
      </p>
      <h2 className="text-3xl font-bold text-slate-950">{t('branchCeo.warehouseTitle')}</h2>
      <p className="mt-2 text-slate-500">{t('branchCeo.warehouseDescription')}</p>
    </div>
  );
}
