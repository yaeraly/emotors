'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { EntityCombobox } from '@/components/EntityCombobox';
import { ProductImageUploader } from '@/components/ProductImageUploader';
import { apiFetch } from '@/lib/api';
import { collectInventoryUnits } from '@/lib/product-code-utils';
import { productUnitOptions } from '@/lib/product-unit';
import { canEditPurchasePriceYuan } from '@/lib/rbac';
import type { Product, ProductCategory, ProductListResponse, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type SupplierOption = { id: string; name: string; isActive?: boolean };
type FactoryOption = { id: string; name: string; isActive?: boolean };
type SuggestedProductCode = {
  categoryId: string;
  prefix: string;
  suggestedCode: string;
  barcode: string;
};
type ProductCodeValidation = {
  valid: boolean;
  normalizedCode: string;
  error: string | null;
};

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
  const validateRequestIdRef = useRef(0);
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
    if (!form.categoryId) return;
    if (lastCategoryIdRef.current === form.categoryId) return;

    lastCategoryIdRef.current = form.categoryId;
    setGeneratingCodes(true);
    setSkuError('');

    void apiFetch<SuggestedProductCode>(
      `/inventory/products/suggest-code?categoryId=${encodeURIComponent(form.categoryId)}`,
    )
      .then((response) => {
        setForm((current) => ({
          ...current,
          sku: response.suggestedCode,
          barcode: response.barcode,
        }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => setGeneratingCodes(false));
  }, [form.categoryId, t]);

  useEffect(() => {
    if (!form.sku.trim() || generatingCodes) {
      setSkuError('');
      return;
    }

    const requestId = ++validateRequestIdRef.current;
    const timer = window.setTimeout(() => {
      void apiFetch<ProductCodeValidation>(
        `/inventory/products/validate-code?sku=${encodeURIComponent(form.sku.trim())}`,
      )
        .then((result) => {
          if (requestId !== validateRequestIdRef.current) return;
          setSkuError(result.valid ? '' : result.error || t('inventory.invalidProductCode'));
        })
        .catch((err) => {
          if (requestId !== validateRequestIdRef.current) return;
          setSkuError(err instanceof Error ? err.message : t('inventory.invalidProductCode'));
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [form.sku, generatingCodes, t]);

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
    setSaving(true);

    try {
      if (!form.categoryId) {
        setError(t('inventory.categoryRequired'));
        setSaving(false);
        return;
      }

      if (!form.sku.trim()) {
        setSkuError(t('inventory.productCodeRequired'));
        setSaving(false);
        return;
      }

      const validation = await apiFetch<ProductCodeValidation>(
        `/inventory/products/validate-code?sku=${encodeURIComponent(form.sku.trim())}`,
      );
      if (!validation.valid) {
        setSkuError(validation.error || t('inventory.activeSkuExists'));
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
          sku: validation.normalizedCode,
          barcode: form.barcode.trim() || validation.normalizedCode,
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
      if (message.toLowerCase().includes('sku') || message.toLowerCase().includes('product code')) {
        setSkuError(message);
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

  function handleSkuChange(value: string) {
    const normalized = value.toUpperCase().replace(/\s+/g, '');
    setForm((current) => ({
      ...current,
      sku: normalized,
      barcode: !current.barcode || current.barcode === current.sku ? normalized : current.barcode,
    }));
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
          <Input
            label={t('inventory.name')}
            value={form.name}
            onChange={(value) => setField('name', value)}
            required
            autoFocus
          />
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
            label={t('inventory.productCode')}
            value={form.sku}
            onChange={handleSkuChange}
            required
            error={skuError}
            hint={generatingCodes ? t('inventory.generatingCodes') : t('inventory.productCodeEditableHint')}
          />
          <EntityCombobox
            label={t('inventory.unit')}
            value={form.unit}
            options={unitOptions}
            onChange={(value) => setField('unit', value || 'pcs')}
            allowClear={false}
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
          <div className="md:col-span-2">
            <ProductImageUploader photoUrl={form.photoUrl} onChange={(value) => setField('photoUrl', value)} />
          </div>
          <ReadOnlyField
            label="Barcode"
            value={form.barcode || '—'}
            hint={generatingCodes ? t('inventory.generatingCodes') : t('inventory.productCodeAutoGenerated')}
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
            disabled={saving || generatingCodes || Boolean(skuError)}
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

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{value}</p>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
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
  autoFocus,
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
  autoFocus?: boolean;
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
        autoFocus={autoFocus}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 uppercase"
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
