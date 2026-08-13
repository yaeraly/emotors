'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';
import { isBranchCashierUser } from '@/lib/rbac';

export default function FinanceIndexPage() {
  const router = useRouter();

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then((user) => {
        if (isBranchCashierUser(user)) {
          router.replace('/branch-cashier/invoices');
          return;
        }
        router.replace('/finance/dashboard');
      })
      .catch(() => router.replace('/finance/dashboard'));
  }, [router]);

  return null;
}
