'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import {
  procurementHubSections,
  warehouseManagerProcurementHubSections,
} from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { isSupplyChainManagerUser, isWarehouseManagerUser } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ProcurementPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  const warehouseManagerView = isWarehouseManagerUser(user);
  const supplyChainManagerView = isSupplyChainManagerUser(user);
  const sections = warehouseManagerView
    ? warehouseManagerProcurementHubSections
    : procurementHubSections;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">EMOTORS OS</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('procurement.title')}</h2>
        </div>
        <ModuleSectionNav sections={sections} />
        {supplyChainManagerView ? (
          <div className="grid gap-4 md:grid-cols-3">
            <ProcurementCard href="/procurement/suppliers" title={t('procurement.suppliers.title')} action={t('procurement.suppliers.new')} />
            <ProcurementCard href="/procurement/factories" title={t('procurement.factories.title')} action={t('procurement.factories.new')} />
            <ProcurementCard href="/procurement/orders" title={t('procurement.orders.title')} action={t('procurement.orders.new')} />
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function ProcurementCard({ href, title, action }: { href: string; title: string; action: string }) {
  return (
    <Link href={href} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md">
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      <p className="mt-4 text-sm font-semibold text-blue-700">{action}</p>
    </Link>
  );
}
