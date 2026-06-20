'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { ProductListResponse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ProductsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [search]);

  useEffect(() => {
    apiFetch<ProductListResponse>(`/inventory/products?${query}`)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('common.error')),
      );
  }, [query, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('inventory.products')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('inventory.productList')}</h2>
          </div>
          <Link href="/products/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
            {t('inventory.createProduct')}
          </Link>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('inventory.searchPlaceholder')}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
        />
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="h-[calc(100vh-250px)] min-h-[420px] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('inventory.photo')}</th>
                  <th className="px-4 py-3">{t('inventory.sku')}</th>
                  <th className="px-4 py-3">{t('inventory.name')}</th>
                  <th className="px-4 py-3">{t('inventory.category')}</th>
                  <th className="px-4 py-3">{t('inventory.warehouse')}</th>
                  <th className="px-4 py-3">{t('inventory.quantity')}</th>
                  <th className="px-4 py-3">{t('inventory.finalCost')}</th>
                  <th className="px-4 py-3">{t('inventory.sellingPriceKgs')}</th>
                  <th className="px-4 py-3">{t('inventory.marginPercent')}</th>
                  <th className="px-4 py-3">{t('inventory.lowStock')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((product) => (
                  <tr key={product.id} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3">
                      {product.photoUrl ? (
                        <img src={product.photoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-slate-100" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{product.sku}</td>
                    <td className="px-4 py-3">{product.name}</td>
                    <td className="px-4 py-3">{product.category}</td>
                    <td className="px-4 py-3">{product.warehouse?.name}</td>
                    <td className="px-4 py-3">{product.quantity}</td>
                    <td className="px-4 py-3">{formatKgs(product.finalCostKgs)}</td>
                    <td className="px-4 py-3">{formatKgs(product.sellingPriceKgs)}</td>
                    <td className="px-4 py-3">{Number(product.marginPercent).toFixed(2)}%</td>
                    <td className="px-4 py-3">
                      <StockBadge quantity={product.quantity} lowStock={product.lowStock} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/products/${product.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </ProtectedShell>
  );
}

function StockBadge({ quantity, lowStock }: { quantity: number; lowStock: boolean }) {
  const { t } = useTranslation();
  const label = quantity <= 0 ? t('inventory.outOfStock') : lowStock ? t('inventory.lowStockAlert') : t('inventory.inStock');
  const tone = quantity <= 0 ? 'bg-red-100 text-red-700' : lowStock ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700';
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} сом`;
}
