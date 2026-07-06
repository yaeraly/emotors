'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TransportCompaniesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/procurement?tab=transport');
  }, [router]);
  return null;
}
