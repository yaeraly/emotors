'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route: HQ Accountant queue moved to centralized Finance → Счета к оплате.
 */
export default function LegacyAccountantPaymentsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/finance/bills-to-pay');
  }, [router]);

  return null;
}
