'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API_URL } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import { formatBranchCatalogInventoryCost } from '@/lib/branch-product-directory-cost';
import { formatProductUnit } from '@/lib/product-unit';
import type { ProductCategory } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type BranchProductRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  weightKg?: number | null;
  photoUrl?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  isActive: boolean;
  quantity: number;
  lowStock: boolean;
  currentBranchInventoryCost?: number | null;
  branchInventoryCostAvailable?: boolean;
};

type ProductDirectoryResponse = {
  items: BranchProductRow[];
  total: number;
};

function categoryName(category: ProductCategory, language: string) {
  if (language === 'ky') return category.nameKy || category.nameRu;
  if (language === 'en') return category.nameEn || category.nameRu;
  return category.nameRu;
}

export function BranchProductDirectoryListContent() {
  const { t, language } = useTranslation();
  const [data, setData] = useState<ProductDirectoryResponse | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (search.trim()) params.set('search', search.trim());
    if (categoryId) params.set('categoryId', categoryId);
    return params.toString();
  }, [categoryId, search]);

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch<ProductDirectoryResponse>(`/branch-ceo/product-directory?${query}`),
      apiFetch<ProductCategory[]>('/inventory/categories'),
    ])
      .then(([productsResult, categoryResult]) => {
        setData(productsResult);
        setCategories(categoryResult);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('branchCeo.productDirectoryLoadFailed')),
      )
      .finally(() => setLoading(false));
  }, [query, t]);

  return (
    <div className="space-y-6">
      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('inventory.searchPlaceholder')}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
        />
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 focus:ring-2"
        >
          <option value="">{t('inventory.allCategories')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category, language)}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t('inventory.loadingProducts')}</p>
        ) : null}
        {!loading && data && data.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t('inventory.noProductsFound')}</p>
        ) : null}
        {!loading && data && data.items.length > 0 ? (
          <table className="w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('inventory.photo')}</th>
                <th className="px-3 py-2">{t('branchWarehouse.productCode')}</th>
                <th className="px-3 py-2">{t('inventory.name')}</th>
                <th className="px-3 py-2">{t('inventory.category')}</th>
                <th className="px-3 py-2">{t('inventory.unit')}</th>
                <th className="px-3 py-2">{t('inventory.finalCost')}</th>
                <th className="px-3 py-2">{t('inventory.weight')}</th>
                <th className="px-3 py-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((product) => (
                <tr key={product.id} className="hover:bg-blue-50/40">
                  <td className="px-3 py-2">
                    {product.photoUrl ? (
                      <img
                        src={`${API_URL}${product.photoUrl}`}
                        alt={product.name}
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-slate-100" />
                    )}
                  </td>
                  <td className="px-3 py-2 font-semibold">{product.sku}</td>
                  <td className="px-3 py-2">{product.name}</td>
                  <td className="px-3 py-2">{product.category ?? '—'}</td>
                  <td className="px-3 py-2">{formatProductUnit(product.unit, language, t)}</td>
                  <td className="px-3 py-2">{formatBranchCatalogInventoryCost(product)}</td>
                  <td className="px-3 py-2">{product.weightKg ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/branch-ceo/product-directory/${product.id}`}
                      className="font-semibold text-blue-600 hover:text-blue-800"
                    >
                      {t('common.open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
