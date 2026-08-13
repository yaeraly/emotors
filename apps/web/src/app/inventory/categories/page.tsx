'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CategoriesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/product-master?tab=categories');
  }, [router]);
  return null;
}
