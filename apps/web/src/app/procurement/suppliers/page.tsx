'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SuppliersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/procurement?tab=suppliers');
  }, [router]);
  return null;
}
