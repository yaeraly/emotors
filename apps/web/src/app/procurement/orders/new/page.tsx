'use client';

import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementOrderForm } from '@/components/ProcurementOrderForm';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewProcurementOrderPage() {
  const { t } = useTranslation();
  return (
    <ProtectedShell>
      <ProcurementOrderForm mode="create" backHref="/procurement/orders" title={t('procurement.orders.new')} />
    </ProtectedShell>
  );
}
