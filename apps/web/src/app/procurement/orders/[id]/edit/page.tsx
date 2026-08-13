'use client';

import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementOrderForm } from '@/components/ProcurementOrderForm';
import { useTranslation } from '@/i18n/useTranslation';

export default function EditProcurementOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  return (
    <ProtectedShell>
      <ProcurementOrderForm mode="edit" orderId={id} backHref={`/procurement/orders/${id}`} title={t('procurement.orders.edit')} />
    </ProtectedShell>
  );
}
