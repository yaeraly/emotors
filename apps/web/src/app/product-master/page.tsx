'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { warehouseHubSections } from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { canManageProductCatalog } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ProductMasterPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const canManage = canManageProductCatalog(user);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('scm.sidebar.warehouse')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('productMaster.title')}</h2>
          <p className="mt-2 text-slate-500">{t('productMaster.subtitle')}</p>
        </div>

        <ModuleSectionNav sections={warehouseHubSections} />

        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard
            title={t('productMaster.products')}
            description={t('productMaster.productsDescription')}
            href="/products"
            manageHref={canManage ? '/products/new' : undefined}
            manageLabel={t('productMaster.createProduct')}
            viewLabel={t('productMaster.viewProducts')}
          />
          <SectionCard
            title={t('productMaster.categories')}
            description={t('productMaster.categoriesDescription')}
            href="/inventory/categories"
            manageHref={canManage ? '/inventory/categories' : undefined}
            manageLabel={t('productMaster.manageCategories')}
            viewLabel={t('productMaster.viewCategories')}
          />
        </div>

        {!canManage ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('productMaster.readOnlyNotice')}</p>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function SectionCard({
  title,
  description,
  href,
  manageHref,
  manageLabel,
  viewLabel,
}: {
  title: string;
  description: string;
  href: string;
  manageHref?: string;
  manageLabel: string;
  viewLabel: string;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={href} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          {viewLabel}
        </Link>
        {manageHref ? (
          <Link href={manageHref} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            {manageLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
