'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { PermanentDeleteConfirmModal } from '@/components/PermanentDeleteConfirmModal';
import { API_URL, clearToken, getToken, apiFetch } from '@/lib/api';
import { formatProductUnit } from '@/lib/product-unit';
import { canDeleteProduct, shouldHideConfidentialCommercialData } from '@/lib/rbac';
import type { Product, ProductCategory, ProductListResponse, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

export function ProductsListContent() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [deleteTargetProduct, setDeleteTargetProduct] = useState<Product | null>(null);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (search.trim()) params.set('search', search.trim());
    if (categoryId) params.set('categoryId', categoryId);
    return params.toString();
  }, [categoryId, search]);

  async function loadProducts() {
    setLoading(true);
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
      setData(null);
      const message = err instanceof Error ? err.message : t('inventory.loadProductsFailed');
      toast.error(message.includes('справочнику товаров') ? message : t('inventory.loadProductsFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const success = window.localStorage.getItem('emotors_product_success');
    if (success) {
      toast.success(success);
      window.localStorage.removeItem('emotors_product_success');
    }
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function deleteProduct(product: Product) {
    setDeleteTargetProduct(product);
  }

  async function confirmDeleteProduct(reason?: string) {
    const product = deleteTargetProduct;
    if (!product) return;

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    const url = `${API_URL}/inventory/products/${product.id}`;
    setDeletingProductId(product.id);
    setError('');

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
      toast.success(result.deactivated ? t('inventory.productDeactivated') : t('inventory.productDeleted'));
      await loadProducts();
      setDeleteTargetProduct(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('inventory.deleteFailed'));
    } finally {
      setDeletingProductId(null);
    }
  }

  const hideConfidentialCommercial = shouldHideConfidentialCommercialData(currentUser);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="h-[calc(100vh-250px)] min-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t('inventory.loadingProducts')}</p>
        ) : null}
        {!loading && !error && data && data.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t('inventory.noProductsFound')}</p>
        ) : null}
        {!loading && !error && data && data.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="hidden px-3 py-2 sm:table-cell">{t('inventory.photo')}</th>
                <th className="px-3 py-2">{t('inventory.name')}</th>
                <th className="hidden px-3 py-2 md:table-cell">{t('inventory.category')}</th>
                <th className="hidden px-3 py-2 lg:table-cell">{t('inventory.unit')}</th>
                {!hideConfidentialCommercial ? (
                  <th className="hidden px-3 py-2 lg:table-cell">{t('inventory.finalCost')}</th>
                ) : null}
                <th className="px-3 py-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((product) => (
                <tr key={product.id} className="hover:bg-blue-50/40">
                  <td className="hidden px-3 py-2 sm:table-cell">
                    {product.photoUrl ? (
                      <button
                        onClick={() => setPreviewProduct(product)}
                        className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                        type="button"
                      >
                        <img
                          src={`${API_URL}${product.photoUrl}`}
                          alt={product.name}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                      </button>
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-slate-100" />
                    )}
                  </td>
                  <td className="max-w-[12rem] truncate px-3 py-2">
                    <p className="font-semibold text-slate-900" title={product.name}>{product.name}</p>
                    <p className="text-xs text-slate-500">{product.sku}</p>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    {product.productCategory
                      ? categoryName(product.productCategory, language)
                      : product.category}
                  </td>
                  <td className="hidden px-3 py-2 lg:table-cell">{formatProductUnit(product.unit, language, t)}</td>
                  {!hideConfidentialCommercial ? (
                    <td className="hidden px-3 py-2 lg:table-cell">
                      {isProductCostAvailable(product)
                        ? formatKgs(productCatalogUnitCost(product))
                        : t('inventory.costNotCalculated')}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/products/${product.id}`}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold"
                      >
                        {t('common.open')}
                      </Link>
                      {canDeleteProduct(currentUser) ? (
                        <button
                          onClick={() => void deleteProduct(product)}
                          disabled={deletingProductId === product.id}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
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
        ) : null}
      </div>
      {previewProduct?.photoUrl ? (
        <ImagePreviewModal
          images={[{ src: `${API_URL}${previewProduct.photoUrl}`, alt: previewProduct.name }]}
          title={previewProduct.name}
          subtitle={previewProduct.sku}
          onClose={() => setPreviewProduct(null)}
        />
      ) : null}
      <PermanentDeleteConfirmModal
        open={!!deleteTargetProduct}
        loading={deletingProductId !== null}
        onClose={() => setDeleteTargetProduct(null)}
        onConfirm={confirmDeleteProduct}
      />
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} сом`;
}

function isProductCostAvailable(
  product: Pick<Product, 'currentFifoUnitCost' | 'currentHqFifoUnitCost' | 'costAvailable'>,
) {
  if (product.costAvailable !== true) return false;
  const cost = product.currentHqFifoUnitCost ?? product.currentFifoUnitCost;
  if (cost == null) return false;
  return Number(cost) > 0;
}

function productCatalogUnitCost(
  product: Pick<Product, 'currentFifoUnitCost' | 'currentHqFifoUnitCost' | 'costAvailable'>,
) {
  if (!isProductCostAvailable(product)) return null;
  return product.currentHqFifoUnitCost ?? product.currentFifoUnitCost!;
}

function categoryName(category: ProductCategory, language: string) {
  if (language === 'ky') return category.nameKy;
  if (language === 'ru') return category.nameRu;
  return category.nameEn;
}
