'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InventoryCountRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/hq-warehouses?tab=inventory');
  }, [router]);
  return null;
}
