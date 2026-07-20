'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateExpensePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/finance/expenses?new=1');
  }, [router]);
  return null;
}
