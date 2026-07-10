'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { EntityCombobox } from '@/components/EntityCombobox';
import { ProductImageUploader } from '@/components/ProductImageUploader';
import { apiFetch } from '@/lib/api';
import {
  collectInventoryUnits,
  getCategoryPrefix,
  nextProductCodes,
} from '@/lib/product-code-utils';
import { productUnitOptions } from '@/lib/product-unit';
import { canEditPurchasePriceYuan } from '@/lib/rbac';
import type { Product, ProductCategory, ProductListResponse, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type SupplierOption = { id: string; name: string; isActive?: boolean };
type FactoryOption = { id: string; name: string; isActive?: boolean };

export default function NewProductPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [factories, setFactories] = useState<FactoryOption[]>([]);
  const [units, setUnits] = useState<string[]>(['pcs']);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [skuError, setSkuError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const lastCategoryIdRef = useRef('');
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    unit: 'pcs',
    photoUrl: '',
    description: '',
    weightKg: '',
    purchasePriceYuan: '0',
    defaultSupplierId: '',
    defaultFactoryId: '',
    isActive: true,
  });

  useEffect(() => {
    Promise.all([
      apiFetch<ProductCategory[]>('/inventory/categories'),
      apiFetch<SupplierOption[]>('/procurement/suppliers'),
      apiFetch<FactoryOption[]>('/procurement/factories'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=500'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([categoryResult, supplierResult, factoryResult, productsResult, userResult]) => {
        setCategories(categoryResult);
        setSuppliers(supplierResult.filter((row) => row.isActive !== false));
        setFactories(factoryResult.filter((row) => row.isActive !== false));
        setUnits(collectInventoryUnits(productsResult.items.map((product) => product.unit)));
        setCurrentUser(userResult);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  useEffect(() => {
    if (!form.categoryId || categories.length === 0) return;
    if (lastCategoryIdRef.current === form.categoryId) return;

    const category = categories.find((row) => row.id === form.categoryId);
    if (!category) return;

    lastCategoryIdRef.current = form.categoryId;
    setGeneratingCodes(true);

    void apiFetch<ProductListResponse>(
      `/inventory/products?categoryId=${encodeURIComponent(form.categoryId)}&pageSize=500`,
    )
      .then((response) => {
        const prefix = getCategoryPrefix(category, language);
        const codes = nextProductCodes(
          prefix,
          response.items.map((product) => product.sku),
          response.items.map((product) => product.barcode),
        );
        setForm((current) => ({
          ...current,
          sku: codes.sku,
          barcode: codes.barcode,
        }));
        setSkuError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => setGeneratingCodes(false));
  }, [categories, form.categoryId, language, t]);

  const canEditPurchase = canEditPurchasePriceYuan(currentUser);

  const unitOptions = useMemo(
    () => productUnitOptions(units, language, t),
    [units, language, t],
  );
  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
    [suppliers],
  );
  const factoryOptions = useMemo(
    () => factories.map((factory) => ({ value: factory.id, label: factory.name })),
    [factories],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSkuError('');
    setSaving(true);

    try {
      if (!form.categoryId) {
        setError(t('inventory.categoryRequired'));
        setSaving(false);
        return;
      }

      const weightKg = Number(form.weightKg);
      if (!Number.isFinite(weightKg) || weightKg <= 0) {
        setError(t('inventory.weightMustBePositive'));
        setSaving(false);
        return;
      }

      const product = await apiFetch<Product & { restored?: boolean }>('/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          sku: form.sku,
          barcode: form.barcode || undefined,
          categoryId: form.categoryId,
          unit: form.unit,
          photoUrl: form.photoUrl || undefined,
          description: form.description || undefined,
          weightKg,
          purchasePriceYuan: canEditPurchase ? Number(form.purchasePriceYuan) : 0,
          defaultSupplierId: form.defaultSupplierId || undefined,
          defaultFactoryId: form.defaultFactoryId || undefined,
          isActive: form.isActive,
        }),
      });
      window.localStorage.setItem(
        'emotors_product_success',
        product.restored ? t('inventory.productRestored') : t('inventory.productCreated'),
      );
      router.push('/product-master');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('sku')) {
        setSkuError(t('inventory.activeSkuExists'));
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  function setField(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleCategoryChange(categoryId: string) {
    lastCategoryIdRef.current = '';
    setField('categoryId', categoryId);
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('productMaster.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('inventory.createProduct')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <div className="md:col-span-2">
            <ProductImageUploader photoUrl={form.photoUrl} onChange={(value) => setField('photoUrl', value)} />
          </div>
          <Input label={t('inventory.name')} value={form.name} onChange={(value) => setField('name', value)} required />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('inventory.category')}</span>
            <select
              value={form.categoryId}
              onChange={(event) => handleCategoryChange(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">{t('inventory.selectCategory')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryName(category, language)}
                </option>
              ))}
            </select>
          </label>
          <Input
            label={t('inventory.sku')}
            value={form.sku}
            onChange={(value) => {
              setField('sku', value);
              setSkuError('');
            }}
            error={skuError}
            hint={generatingCodes ? t('inventory.generatingCodes') : undefined}
            required
          />
          <Input
            label="Barcode"
            value={form.barcode}
            onChange={(value) => setField('barcode', value)}
            hint={generatingCodes ? t('inventory.generatingCodes') : undefined}
          />
          <EntityCombobox
            label={t('inventory.unit')}
            value={form.unit}
            options={unitOptions}
            onChange={(value) => setField('unit', value || 'pcs')}
            allowClear={false}
            required
          />
          <EntityCombobox
            label={t('procurement.orders.supplier')}
            value={form.defaultSupplierId}
            options={supplierOptions}
            onChange={(value) => setField('defaultSupplierId', value)}
          />
          <EntityCombobox
            label={t('procurement.orders.factory')}
            value={form.defaultFactoryId}
            options={factoryOptions}
            onChange={(value) => setField('defaultFactoryId', value)}
          />
          <Input
            label={t('inventory.weightPerUnitKg')}
            type="number"
            value={form.weightKg}
            onChange={(value) => setField('weightKg', value)}
            min="0.001"
            step="0.001"
            required
          />
          {canEditPurchase ? (
            <Input
              label={t('inventory.purchasePriceYuan')}
              type="number"
              value={form.purchasePriceYuan}
              onChange={(value) => setField('purchasePriceYuan', value)}
            />
          ) : null}
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('common.status')}</span>
            <select
              value={form.isActive ? 'ACTIVE' : 'INACTIVE'}
              onChange={(event) => setField('isActive', event.target.value === 'ACTIVE')}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="ACTIVE">{t('warehouse.active')}</option>
              <option value="INACTIVE">{t('warehouse.inactive')}</option>
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('inventory.description')}</span>
            <textarea
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            disabled={saving || generatingCodes}
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300 md:col-span-2"
            type="submit"
          >
            {saving ? t('common.loading') : t('inventory.createProduct')}
          </button>
        </section>
      </form>
    </ProtectedShell>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  required,
  error,
  hint,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        min={min ?? (type === 'number' ? 0 : undefined)}
        step={step ?? (type === 'number' ? '0.01' : undefined)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span> : null}
    </label>
  );
}

function categoryName(category: ProductCategory, language: string) {
  if (language === 'ky') return category.nameKy;
  if (language === 'ru') return category.nameRu;
  return category.nameEn;
}
