'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route: Supplier Payments are managed inside each Procurement Order
 * (Заказы закупки → Открыть → Платежи поставщику).
 */
export default function LegacyProcurementPaymentsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/procurement?tab=orders');
  }, [router]);

  return null;
}
