'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { isHqSalesManagerUser } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { hqSalesBranchOrdersSubNavSections } from '@/lib/scm-hub-sections';
import { ModuleSectionNav } from './ModuleSectionNav';

export function HqSalesBranchOrdersNav() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (!isHqSalesManagerUser(user)) return null;

  return <ModuleSectionNav sections={hqSalesBranchOrdersSubNavSections} variant="tabs" />;
}
