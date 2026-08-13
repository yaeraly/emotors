'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { API_URL, apiFetch } from '@/lib/api';
import { formatProductUnit } from '@/lib/product-unit';
import { useTranslation } from '@/i18n/useTranslation';

type BranchProductDetail = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  unit: string;
  weightKg?: number | null;
  photoUrl?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  isActive: boolean;
  quantity: number;
};

export default function BranchCeoProductDirectoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useTranslation();
  const [product, setProduct] = useState<BranchProductDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<BranchProductDetail>(`/branch-ceo/product-directory/${id}`)
      .then(setProduct)
      .catch((err) => setError(err instanceof Error ? err.message : t('branchCeo.productDirectoryLoadFailed')));
  }, [id, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <Link href="/branch-ceo/product-directory" className="text-sm font-semibold text-blue-600">
          ← {t('productMaster.title')}
        </Link>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {product ? (
          <div className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[220px_1fr]">
            {product.photoUrl ? (
              <img
                src={`${API_URL}${product.photoUrl}`}
                alt={product.name}
                className="h-52 w-full rounded-2xl object-cover"
              />
            ) : (
              <div className="h-52 rounded-2xl bg-slate-100" />
            )}
            <div className="space-y-4">
              <div>
                <h2 className="text-3xl font-bold text-slate-950">{product.name}</h2>
                <p className="mt-1 text-slate-500">{product.sku}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label={t('inventory.category')} value={product.category ?? '—'} />
                <Detail label={t('inventory.brand')} value={product.brand ?? '—'} />
                <Detail label={t('inventory.unit')} value={formatProductUnit(product.unit, language, t)} />
                <Detail label={t('inventory.barcode')} value={product.barcode ?? '—'} />
                <Detail label={t('inventory.weight')} value={product.weightKg ? `${product.weightKg} kg` : '—'} />
                <Detail label={t('inventory.quantity')} value={String(product.quantity)} />
              </div>
              {product.description ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('inventory.description')}</p>
                  <p className="mt-1 text-sm text-slate-700">{product.description}</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
