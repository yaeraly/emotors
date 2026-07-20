'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import {
  hasPermission,
  isBranchAccountantUser,
  isBranchCashierUser,
  isBranchOwnerUser,
} from '@/lib/rbac';
import type { User } from '@/lib/types';

type FinanceLinkRole = 'view' | 'manage' | 'cashier' | 'owner';

const links: Array<{ href: string; key: string; roles: FinanceLinkRole[] }> = [
  { href: '/finance/accounts', key: 'finance.accounts', roles: ['view', 'manage', 'cashier'] },
  { href: '/finance/transfers', key: 'finance.transfers', roles: ['view', 'manage', 'owner'] },
  { href: '/finance/investments', key: 'finance.investments', roles: ['owner'] },
  { href: '/finance/shifts', key: 'finance.shifts', roles: ['cashier', 'manage'] },
  { href: '/finance/reports', key: 'finance.reports', roles: ['view', 'owner'] },
  { href: '/finance/audit', key: 'finance.audit', roles: ['view', 'manage'] },
  { href: '/tax', key: 'tax.title', roles: ['view'] },
  { href: '/distribution/invoices', key: 'distribution.invoices', roles: ['view'] },
  { href: '/distribution/branch-balances', key: 'distribution.branchBalances', roles: ['view'] },
  { href: '/payroll', key: 'payroll.title', roles: ['view'] },
];

export default function FinancePage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const visibleLinks = links.filter((link) => {
    if (!user) return false;
    if (isBranchCashierUser(user)) {
      return link.roles.includes('cashier');
    }
    if (isBranchAccountantUser(user)) {
      return link.roles.includes('manage') || link.roles.includes('view');
    }
    if (isBranchOwnerUser(user)) {
      return link.roles.includes('owner') || link.roles.includes('view');
    }
    return hasPermission(user, 'finance.view') || hasPermission(user, 'finance.manage');
  });

  return (
    <ProtectedShell>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('nav.finance')}</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('nav.finance')}</h2>
        <p className="mt-2 text-slate-600">{t('finance.hubDescription')}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-slate-200 p-4 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
            >
              {t(link.key)}
            </Link>
          ))}
        </div>
      </section>
    </ProtectedShell>
  );
}
