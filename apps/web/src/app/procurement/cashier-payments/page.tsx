'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy HQ Cashier queue — redirects to unified Счета к оплате. */
export default function CashierPaymentsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/finance/cashier-bills');
  }, [router]);
  return null;
}
