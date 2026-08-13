'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProcurementOrdersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/procurement?tab=orders');
  }, [router]);
  return null;
}
