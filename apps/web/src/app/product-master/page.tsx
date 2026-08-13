'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SectionTopNav } from '@/components/SectionTopNav';
import { CategoriesListContent } from '@/components/product-master/CategoriesListContent';
import { ProductsListContent } from '@/components/product-master/ProductsListContent';
import { apiFetch } from '@/lib/api';
import { canManageProductCatalog } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProductMasterTab = 'products' | 'categories';

export default function ProductMasterPage() {
  return (
    <Suspense
      fallback={
        <ProtectedShell>
          <p className="p-6 text-slate-500">...</p>
        </ProtectedShell>
      }
    >
      <ProductMasterPageContent />
    </Suspense>
  );
}

function ProductMasterPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);

  const tabParam = searchParams.get('tab');
  const activeTab: ProductMasterTab = tabParam === 'categories' ? 'categories' : 'products';

  useEffect(() => {
    apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (activeTab !== 'categories') {
      setCategoryCreateOpen(false);
    }
  }, [activeTab]);

  const canManage = canManageProductCatalog(user);

  const tabs = useMemo(
    () => [
      { id: 'products', label: t('productMaster.products') },
      { id: 'categories', label: t('productMaster.categories') },
    ],
    [t],
  );

  const createAction =
    activeTab === 'products' && canManage
      ? { href: '/products/new', label: t('productMaster.createProduct') }
      : activeTab === 'categories' && canManage
        ? { href: '/product-master?tab=categories', label: t('inventory.createCategory') }
        : null;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('productMaster.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('productMaster.title')}</h2>
          <p className="mt-2 text-slate-500">{t('productMaster.subtitle')}</p>
        </div>

        <SectionTopNav
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tabId) => router.replace(`/product-master?tab=${tabId}`)}
          action={
            createAction && activeTab === 'products' ? (
              <Link href={createAction.href} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
                {createAction.label}
              </Link>
            ) : createAction && activeTab === 'categories' ? (
              <button
                type="button"
                onClick={() => {
                  setCategoryCreateOpen(true);
                  void apiFetch('/inventory/categories/create-opened', { method: 'POST' }).catch(() => undefined);
                }}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
              >
                {createAction.label}
              </button>
            ) : null
          }
        />

        {activeTab === 'products' ? (
          <ProductsListContent />
        ) : (
          <CategoriesListContent
            createFormOpen={categoryCreateOpen}
            onCreateFormOpenChange={setCategoryCreateOpen}
          />
        )}
      </section>
    </ProtectedShell>
  );
}
