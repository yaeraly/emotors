'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProductsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/product-master?tab=products');
  }, [router]);
  return null;
}
