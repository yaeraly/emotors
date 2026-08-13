'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FactoriesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/procurement?tab=factories');
  }, [router]);
  return null;
}
