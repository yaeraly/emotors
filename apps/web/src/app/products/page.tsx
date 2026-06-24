'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { API_URL, clearToken, getToken } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import { canManageProductCatalog } from '@/lib/rbac';
import type { Product, ProductCategory, ProductListResponse, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ProductsPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (search.trim()) params.set('search', search.trim());
    if (categoryId) params.set('categoryId', categoryId);
    return params.toString();
  }, [categoryId, search]);

  async function loadProducts() {
    setError('');
    try {
      const [productsResult, categoryResult] = await Promise.all([
      apiFetch<ProductListResponse>(`/inventory/products?${query}`),
      apiFetch<ProductCategory[]>('/inventory/categories'),
      ]);
      setData(productsResult);
      setCategories(categoryResult);
      void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function deleteProduct(product: Product) {
    if (!window.confirm(t('inventory.confirmDeleteProduct'))) return;

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    const url = `${API_URL}/inventory/products/${product.id}`;
    setDeletingProductId(product.id);
    setError('');
    setSuccessMessage('');

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (fetchError) {
        console.error('Product delete network error', fetchError);
        throw new Error(t('inventory.apiNotReachable'));
      }

      if (response.status === 401) {
        clearToken();
        router.replace('/login');
        return;
      }

      if (!response.ok) {
        const responseBody = await response.text();
        console.error('Product delete failed', {
          status: response.status,
          url,
          responseBody,
        });
        if (response.status === 403) throw new Error(t('inventory.noDeletePermission'));
        if (response.status === 404) throw new Error(t('inventory.productNotFound'));
        throw new Error(t('inventory.deleteFailed'));
      }

      const result = (await response.json()) as { success: boolean; deactivated?: boolean };
      setSuccessMessage(
        result.deactivated ? t('inventory.productDeactivated') : t('inventory.productDeleted'),
      );
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('inventory.deleteFailed'));
    } finally {
      setDeletingProductId(null);
    }
  }

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
          {canManageProductCatalog(currentUser) ? (
            <Link href="/products/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('inventory.createProduct')}
            </Link>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
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
        {successMessage ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</p> : null}

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
                        <img src={`${API_URL}${product.photoUrl}`} alt="" className="h-12 w-12 rounded-xl object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-slate-100" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{product.sku}</td>
                    <td className="px-4 py-3">{product.name}</td>
                    <td className="px-4 py-3">
                      {product.productCategory
                        ? categoryName(product.productCategory, language)
                        : product.category}
                    </td>
                    <td className="px-4 py-3">{product.warehouse?.name}</td>
                    <td className="px-4 py-3">{product.quantity}</td>
                    <td className="px-4 py-3">{formatKgs(product.finalCostKgs)}</td>
                    <td className="px-4 py-3">{formatKgs(product.sellingPriceKgs)}</td>
                    <td className="px-4 py-3">{Number(product.marginPercent).toFixed(2)}%</td>
                    <td className="px-4 py-3">
                      <StockBadge quantity={product.quantity} lowStock={product.lowStock} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/products/${product.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                          {t('common.open')}
                        </Link>
                        {canManageProductCatalog(currentUser) ? (
                          <button
                            onClick={() => void deleteProduct(product)}
                            disabled={deletingProductId === product.id}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            type="button"
                          >
                            {deletingProductId === product.id ? t('common.loading') : t('common.delete')}
                          </button>
                        ) : null}
                      </div>
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

function categoryName(category: ProductCategory, language: string) {
  if (language === 'ky') return category.nameKy;
  if (language === 'ru') return category.nameRu;
  return category.nameEn;
}
