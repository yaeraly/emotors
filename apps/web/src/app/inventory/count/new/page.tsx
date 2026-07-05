'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canManageInventoryCount, canViewProcurement } from '@/lib/rbac';
import type {
  InventoryCountSession,
  InventoryCountType,
  Product,
  ProductCategory,
  ProductListResponse,
  User,
  Warehouse,
} from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const inventoryTypes: InventoryCountType[] = [
  'FULL_WAREHOUSE',
  'CATEGORY',
  'SHELF',
  'ZONE',
  'PRODUCT',
];

type Supplier = { id: string; name: string };

export default function NewInventoryCountPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    warehouseId: '',
    inventoryType: 'FULL_WAREHOUSE' as InventoryCountType,
    categoryId: '',
    shelf: '',
    zone: '',
    filterBrand: '',
    filterSupplierId: '',
    filterProductIds: [] as string[],
    notes: '',
  });

  useEffect(() => {
    Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
      apiFetch<ProductCategory[]>('/inventory/categories'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=300'),
    ])
      .then(async ([me, warehouseResult, categoryResult, productResult]) => {
        setCurrentUser(me);
        setWarehouses(warehouseResult);
        setCategories(categoryResult);
        setProducts(productResult.items);
        setForm((current) => ({
          ...current,
          warehouseId: current.warehouseId || warehouseResult[0]?.id || '',
        }));
        if (canViewProcurement(me)) {
          try {
            const supplierResult = await apiFetch<Supplier[]>('/procurement/suppliers');
            setSuppliers(supplierResult);
          } catch {
            setSuppliers([]);
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  if (currentUser && !canManageInventoryCount(currentUser)) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        warehouseId: form.warehouseId,
        inventoryType: form.inventoryType,
        notes: form.notes || undefined,
      };

      if (form.inventoryType === 'CATEGORY') {
        payload.categoryId = form.categoryId;
        payload.filterCategoryId = form.categoryId;
      }
      if (form.inventoryType === 'SHELF') {
        payload.shelf = form.shelf;
        payload.filterShelf = form.shelf;
      }
      if (form.inventoryType === 'ZONE') {
        payload.zone = form.zone;
        payload.filterZone = form.zone;
      }
      if (form.inventoryType === 'PRODUCT') {
        payload.filterProductIds = form.filterProductIds;
      }
      if (form.filterBrand.trim()) payload.filterBrand = form.filterBrand.trim();
      if (form.filterSupplierId) payload.filterSupplierId = form.filterSupplierId;

      const session = await apiFetch<InventoryCountSession>('/inventory-count/sessions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      router.push(`/inventory/count/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleProduct(productId: string) {
    setForm((current) => ({
      ...current,
      filterProductIds: current.filterProductIds.includes(productId)
        ? current.filterProductIds.filter((id) => id !== productId)
        : [...current.filterProductIds, productId],
    }));
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/inventory/count" className="text-sm font-semibold text-blue-600">
            ← {t('inventoryCount.title')}
          </Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('inventoryCount.newInventory')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <form onSubmit={submit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('inventory.warehouse')}>
              <select
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                required
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('inventoryCount.inventoryType')}>
              <select
                value={form.inventoryType}
                onChange={(e) =>
                  setForm({ ...form, inventoryType: e.target.value as InventoryCountType })
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {inventoryTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`inventoryCount.type.${type}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {form.inventoryType === 'CATEGORY' ? (
            <Field label={t('inventory.category')}>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                required
              >
                <option value="">{t('inventory.selectCategory')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nameRu}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {form.inventoryType === 'SHELF' ? (
            <Field label={t('inventoryCount.shelf')}>
              <input
                value={form.shelf}
                onChange={(e) => setForm({ ...form, shelf: e.target.value })}
                placeholder="A-01"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                required
              />
            </Field>
          ) : null}

          {form.inventoryType === 'ZONE' ? (
            <Field label={t('inventoryCount.zone')}>
              <input
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                placeholder="Zone B"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                required
              />
            </Field>
          ) : null}

          {form.inventoryType === 'PRODUCT' ? (
            <Field label={t('inventoryCount.selectProducts')}>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 p-3">
                {products.map((product) => (
                  <label key={product.id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={form.filterProductIds.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                    />
                    <span>
                      {product.sku} · {product.name}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('inventoryCount.filterBrand')}>
              <input
                value={form.filterBrand}
                onChange={(e) => setForm({ ...form, filterBrand: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </Field>
            {suppliers.length > 0 ? (
              <Field label={t('procurement.supplier')}>
                <select
                  value={form.filterSupplierId}
                  onChange={(e) => setForm({ ...form, filterSupplierId: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">{t('inventoryCount.allSuppliers')}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>

          <Field label={t('inventoryCount.notes')}>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {t('inventoryCount.createSession')}
          </button>
        </form>
      </section>
    </ProtectedShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
