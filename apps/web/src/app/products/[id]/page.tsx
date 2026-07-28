'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { EntityCombobox } from '@/components/EntityCombobox';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProductImageUploader } from '@/components/ProductImageUploader';
import { apiFetch } from '@/lib/api';
import { collectInventoryUnits } from '@/lib/product-code-utils';
import { formatProductUnit, productUnitOptions } from '@/lib/product-unit';
import { ProductMaximumPolicySection } from '@/components/pricing/ProductMaximumPolicySection';
import {
  canEditProductCatalog,
  canEditProductUnit,
  canEditPurchasePriceYuan,
  canManagePricingPolicy,
  shouldHideProductPricingFromProfile,
} from '@/lib/rbac';
import type { Product, ProductCategory, ProductListResponse, ProductPurchasePriceHistory, PurchasePriceChangeReason, User, Warehouse } from '@/lib/types';

type SuggestedProductCode = {
  categoryId: string;
  prefix: string;
  suggestedCode: string;
  barcode: string;
};
import { useTranslation } from '@/i18n/useTranslation';

export default function ProductDetailPage() {
  const { t, language } = useTranslation();
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<string[]>(['pcs']);
  const [editForm, setEditForm] = useState({
    name: '',
    sku: '',
    categoryId: '',
    photoUrl: '',
    warehouseId: '',
    unit: 'pcs',
    weightKg: '0',
    minStockLevel: '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unitError, setUnitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showPurchasePriceHistory, setShowPurchasePriceHistory] = useState(false);
  const [purchasePriceForm, setPurchasePriceForm] = useState({
    purchasePriceYuan: '0',
    reason: 'SUPPLIER_PRICE_CHANGE' as PurchasePriceChangeReason,
    note: '',
  });
  const [priceSaving, setPriceSaving] = useState(false);
  const [originalCategoryId, setOriginalCategoryId] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const previewCategoryIdRef = useRef('');

  useEffect(() => {
    const success = window.localStorage.getItem('emotors_product_success');
    if (success) {
      setSuccessMessage(success);
      window.localStorage.removeItem('emotors_product_success');
    }
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<Product>(`/inventory/products/${params.id}`),
      apiFetch<ProductCategory[]>('/inventory/categories'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=500'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([productResult, categoryResult, warehouseResult, productsResult, currentUserResult]) => {
        setProduct(productResult);
        setCategories(categoryResult);
        setWarehouses(warehouseResult);
        setUnits(collectInventoryUnits([
          ...productsResult.items.map((item) => item.unit),
          productResult.unit,
        ]));
        setCurrentUser(currentUserResult);
        const currentWarehouseActive = productResult.warehouse?.isActive !== false;
        setOriginalCategoryId(productResult.categoryId);
        setEditForm({
          name: productResult.name,
          sku: productResult.sku,
          categoryId: productResult.categoryId,
          photoUrl: productResult.photoUrl ?? '',
          warehouseId: currentWarehouseActive ? productResult.warehouseId : '',
          unit: productResult.unit || 'pcs',
          weightKg: String(productResult.weightKg),
          minStockLevel: String(productResult.minStockLevel),
        });
        setPurchasePriceForm({
          purchasePriceYuan: String(productResult.purchasePriceYuan ?? 0),
          reason: 'SUPPLIER_PRICE_CHANGE',
          note: '',
        });
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('common.error')),
      );
  }, [params.id, t]);

  const categoryChanged = Boolean(
    originalCategoryId && editForm.categoryId && editForm.categoryId !== originalCategoryId,
  );

  useEffect(() => {
    if (!categoryChanged || !editForm.categoryId) {
      setPreviewCode('');
      previewCategoryIdRef.current = '';
      return;
    }

    if (previewCategoryIdRef.current === editForm.categoryId) return;
    previewCategoryIdRef.current = editForm.categoryId;
    setGeneratingPreview(true);

    void apiFetch<SuggestedProductCode>(
      `/inventory/products/suggest-code?categoryId=${encodeURIComponent(editForm.categoryId)}`,
    )
      .then((response) => {
        setPreviewCode(response.suggestedCode);
      })
      .catch(() => {
        setPreviewCode('');
      })
      .finally(() => setGeneratingPreview(false));
  }, [categoryChanged, editForm.categoryId]);

  const currentWarehouseInactive = Boolean(product?.warehouse && product.warehouse.isActive === false);
  const canSaveWarehouse = !currentWarehouseInactive || Boolean(editForm.warehouseId);
  const canEditUnit = canEditProductUnit(currentUser);
  const hidePricingProfile = shouldHideProductPricingFromProfile(currentUser);
  const showMaximumPolicy = canManagePricingPolicy(currentUser) || !hidePricingProfile;

  const unitOptions = useMemo(
    () => productUnitOptions(units, language, t),
    [units, language, t],
  );

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setUnitError('');
    setSuccessMessage('');

    try {
      if (!editForm.categoryId) {
        setError(t('inventory.categoryRequired'));
        return;
      }

      if (canEditUnit && !editForm.unit.trim()) {
        setUnitError(t('inventory.unitRequired'));
        return;
      }

      if (canEditUnit && !unitOptions.some((option) => option.value === editForm.unit.trim())) {
        setUnitError(t('inventory.unitRequired'));
        return;
      }

      if (canEditProductCatalog(currentUser) && !editForm.warehouseId) {
        setError(t('inventory.activeWarehouseRequired'));
        return;
      }

      if (categoryChanged) {
        const confirmed = window.confirm(t('inventory.categoryChangeCodeConfirm'));
        if (!confirmed) {
          return;
        }
      }

      const nextWeight = Number(editForm.weightKg);
      if (canEditProductCatalog(currentUser) && (!Number.isFinite(nextWeight) || nextWeight <= 0)) {
        setError(t('inventory.weightMustBePositive'));
        return;
      }

      const updated = await apiFetch<Product>(`/inventory/products/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name,
          ...(categoryChanged ? {} : { sku: editForm.sku }),
          categoryId: editForm.categoryId,
          photoUrl: editForm.photoUrl || null,
          ...(canEditUnit ? { unit: editForm.unit.trim() } : {}),
          ...(canEditProductCatalog(currentUser)
            ? { weightKg: nextWeight, warehouseId: editForm.warehouseId }
            : {}),
          minStockLevel: Number(editForm.minStockLevel),
        }),
      });
      setProduct(updated);
      setOriginalCategoryId(updated.categoryId);
      setPreviewCode('');
      setEditForm({
        name: updated.name,
        sku: updated.sku,
        categoryId: updated.categoryId,
        photoUrl: updated.photoUrl ?? '',
        warehouseId: updated.warehouse?.isActive === false ? '' : updated.warehouseId,
        unit: updated.unit || 'pcs',
        weightKg: String(updated.weightKg),
        minStockLevel: String(updated.minStockLevel),
      });
      setSuccessMessage(t('inventory.productUpdatedSuccess'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('inactive warehouse')) {
        setError(t('inventory.cannotAssignInactiveWarehouse'));
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function savePurchasePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPriceSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const updated = await apiFetch<Product>(`/inventory/products/${params.id}/purchase-price`, {
        method: 'PUT',
        body: JSON.stringify({
          purchasePriceYuan: Number(purchasePriceForm.purchasePriceYuan),
          reason: purchasePriceForm.reason,
          note: purchasePriceForm.note || undefined,
        }),
      });
      setProduct(updated);
      setPurchasePriceForm((current) => ({
        ...current,
        purchasePriceYuan: String(updated.purchasePriceYuan),
        note: '',
      }));
      setSuccessMessage(t('common.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPriceSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <Link href="/products" className="text-sm font-semibold text-blue-700">{t('inventory.products')}</Link>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {successMessage ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</p> : null}
        {product ? (
          <>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 md:flex-row">
                {product.photoUrl ? (
                  <button onClick={() => setPreviewOpen(true)} className="group block focus:outline-none" type="button">
                    <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${product.photoUrl}`} alt={product.name} className="h-40 w-40 rounded-3xl object-cover ring-blue-500 transition group-hover:ring-4" />
                  </button>
                ) : <div className="h-40 w-40 rounded-3xl bg-slate-100" />}
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('inventory.productCode')}</p>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{product.sku}</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-950">{product.name}</h2>
                  <p className="mt-2 text-slate-500">{product.description}</p>
                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <Info label={t('inventory.category')} value={product.productCategory ? categoryName(product.productCategory, language) : product.category} />
                    <Info label={t('inventory.unit')} value={formatProductUnit(product.unit, language, t)} />
                    <Info label={t('inventory.warehouse')} value={product.warehouse?.name ?? ''} />
                    <Info label={t('inventory.weightPerUnitKg')} value={`${Number(product.weightKg).toFixed(3)} kg`} />
                    <Info label={t('inventory.quantity')} value={String(product.quantity)} />
                    <Info label={t('inventory.lowStock')} value={product.lowStock ? t('inventory.lowStockAlert') : t('inventory.inStock')} />
                  </div>
                </div>
              </div>
            </article>

            {canEditProductCatalog(currentUser) ? (
              <form onSubmit={saveProduct} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-5">
                {currentWarehouseInactive ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 md:col-span-5">
                    {t('inventory.inactiveWarehouseWarning')}
                    {product.warehouse?.name ? ` (${product.warehouse.name})` : ''}
                  </p>
                ) : null}
                <div className="md:col-span-5">
                  <ProductImageUploader
                    photoUrl={editForm.photoUrl}
                    onChange={(value) => setEditForm({ ...editForm, photoUrl: value })}
                  />
                </div>
                <Input label={t('inventory.name')} value={editForm.name} onChange={(value) => setEditForm({ ...editForm, name: value })} />
                <ReadOnlyField label={t('inventory.productCode')} value={editForm.sku} />
                {categoryChanged ? (
                  <div className="md:col-span-5 space-y-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p>{t('inventory.categoryChangeCodeNotice')}</p>
                    {generatingPreview ? (
                      <p className="text-amber-700">{t('common.loading')}</p>
                    ) : previewCode ? (
                      <p className="font-semibold">
                        {t('inventory.categoryChangeCodePreview').replace('{code}', previewCode)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('inventory.category')}</span>
                  <select value={editForm.categoryId} onChange={(event) => setEditForm({ ...editForm, categoryId: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" required>
                    <option value="">{t('inventory.selectCategory')}</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{categoryName(category, language)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">{t('inventory.warehouse')}</span>
                  <select
                    value={editForm.warehouseId}
                    onChange={(event) => setEditForm({ ...editForm, warehouseId: event.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                    required
                  >
                    <option value="">{t('inventory.selectWarehouse')}</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                    ))}
                  </select>
                </label>
                {canEditUnit ? (
                  <div>
                    <EntityCombobox
                      label={t('inventory.unit')}
                      value={editForm.unit}
                      options={unitOptions}
                      onChange={(value) => {
                        setEditForm({ ...editForm, unit: value });
                        setUnitError('');
                      }}
                      allowClear={false}
                      required
                    />
                    {unitError ? <p className="mt-1 text-xs font-semibold text-red-600">{unitError}</p> : null}
                  </div>
                ) : null}
                {!hidePricingProfile ? (
                  <ReadOnlyField label={t('inventory.sellingPriceKgs')} value={formatKgs(product.sellingPriceKgs)} hint={t('inventory.sellingPriceFromPolicy')} />
                ) : null}
                <Input label={t('inventory.weightPerUnitKg')} type="number" value={editForm.weightKg} onChange={(value) => setEditForm({ ...editForm, weightKg: value })} min="0.001" step="0.001" />
                <Input label={t('inventory.minStockLevel')} type="number" value={editForm.minStockLevel} onChange={(value) => setEditForm({ ...editForm, minStockLevel: value })} />
                <button disabled={saving || !canSaveWarehouse} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300 md:col-span-5" type="submit">{saving ? t('common.loading') : t('common.save')}</button>
              </form>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-3">
              <Panel title={t('inventory.productDetail')}>
                <Info label={t('inventory.currentPurchasePriceYuan')} value={formatYuan(product.purchasePriceYuan)} />
                <Info label={t('inventory.lastPriceUpdated')} value={product.purchasePriceUpdatedAt ? new Date(product.purchasePriceUpdatedAt).toLocaleString() : '-'} />
                <Info label={t('procurement.orders.supplier')} value={product.defaultSupplier?.name ?? '-'} />
                <Info label={t('procurement.orders.factory')} value={product.defaultFactory?.name ?? '-'} />
                <Info label={t('inventory.latestYuanRate')} value={String(product.latestYuanRate)} />
                <Info
                  label={t('inventory.finalCostKgs')}
                  value={
                    product.costAvailable === true &&
                    product.currentFifoUnitCost != null &&
                    product.currentFifoUnitCost > 0
                      ? formatKgs(product.currentFifoUnitCost)
                      : t('inventory.costNotCalculated')
                  }
                />
                {!hidePricingProfile ? (
                  <>
                    <Info label={t('inventory.sellingPriceKgs')} value={formatKgs(product.sellingPriceKgs)} />
                    <Info label={t('inventory.marginAmount')} value={`${formatKgs(product.marginAmount)} (${Number(product.marginPercent).toFixed(2)}%)`} />
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowPurchasePriceHistory((current) => !current)}
                  className="mt-2 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700"
                >
                  {t('inventory.viewPurchasePriceHistory')}
                </button>
              </Panel>
              {canEditPurchasePriceYuan(currentUser) ? (
                <Panel title={t('inventory.updatePurchasePrice')}>
                  <form onSubmit={savePurchasePrice} className="space-y-3">
                    <Input
                      label={t('inventory.currentPurchasePriceYuan')}
                      type="number"
                      value={purchasePriceForm.purchasePriceYuan}
                      onChange={(value) => setPurchasePriceForm({ ...purchasePriceForm, purchasePriceYuan: value })}
                      step="0.01"
                    />
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">{t('inventory.purchasePriceChangeReason')}</span>
                      <select
                        value={purchasePriceForm.reason}
                        onChange={(event) => setPurchasePriceForm({ ...purchasePriceForm, reason: event.target.value as PurchasePriceChangeReason })}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                      >
                        {PURCHASE_PRICE_REASONS.map((reason) => (
                          <option key={reason} value={reason}>{t(`inventory.purchasePriceReason.${reason}`)}</option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label={t('inventory.purchasePriceChangeNote')}
                      value={purchasePriceForm.note}
                      onChange={(value) => setPurchasePriceForm({ ...purchasePriceForm, note: value })}
                    />
                    <button disabled={priceSaving} type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-blue-300">
                      {priceSaving ? t('common.loading') : t('common.save')}
                    </button>
                  </form>
                </Panel>
              ) : null}
              {showMaximumPolicy ? <ProductMaximumPolicySection productId={params.id} /> : null}
              {!hidePricingProfile ? (
              <Panel title={t('inventory.priceHistory')}>
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {product.priceHistory?.length ? product.priceHistory.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                      <p className="font-bold">{formatKgs(item.finalCostKgs)} → {formatKgs(item.sellingPriceKgs)}</p>
                      <p className="text-slate-500">¥{Number(item.purchasePriceYuan).toFixed(2)} · {t('inventory.latestYuanRate')} {Number(item.yuanRate).toFixed(4)}</p>
                      <p className="text-slate-500">{new Date(item.effectiveFrom).toLocaleDateString()}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">{t('inventory.noPriceHistory')}</p>}
                </div>
              </Panel>
              ) : null}
              <Panel title={t('inventory.stockMovements')}>
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {product.stockMovements?.length ? product.stockMovements.map((movement) => (
                    <div key={movement.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                      <p className="font-bold">{movement.type} · {movement.quantity}</p>
                      <p className="text-slate-500">{movement.warehouse?.name}</p>
                      <p className="text-slate-500">{new Date(movement.createdAt).toLocaleString()}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">{t('inventory.noMovements')}</p>}
                </div>
              </Panel>
            </div>
            {showPurchasePriceHistory ? (
              <Panel title={t('inventory.purchasePriceHistory')}>
                <PurchasePriceHistoryTable
                  items={product.purchasePriceHistory ?? []}
                  emptyLabel={t('inventory.noPurchasePriceHistory')}
                  t={t}
                />
              </Panel>
            ) : null}
            {product.photoUrl && previewOpen ? (
              <ImagePreviewModal
                images={[{ src: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${product.photoUrl}`, alt: product.name }]}
                title={product.name}
                subtitle={product.sku}
                onClose={() => setPreviewOpen(false)}
              />
            ) : null}
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold text-slate-950">{title}</h3><div className="mt-4 space-y-3">{children}</div></section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function Input({ label, value, onChange, type = 'text', min, step }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; step?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} min={min ?? (type === 'number' ? 0 : undefined)} step={step ?? (type === 'number' ? '0.01' : undefined)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{value}</p>
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const PURCHASE_PRICE_REASONS: PurchasePriceChangeReason[] = [
  'SUPPLIER_PRICE_CHANGE',
  'FACTORY_PRICE_UPDATE',
  'MANUAL_CORRECTION',
];

function PurchasePriceHistoryTable({
  items,
  emptyLabel,
  t,
}: {
  items: ProductPurchasePriceHistory[];
  emptyLabel: string;
  t: (key: string) => string;
}) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">{t('inventory.effectiveDate')}</th>
            <th className="px-3 py-2">{t('inventory.oldPriceYuan')}</th>
            <th className="px-3 py-2">{t('inventory.newPriceYuan')}</th>
            <th className="px-3 py-2">{t('inventory.priceDifferenceYuan')}</th>
            <th className="px-3 py-2">{t('inventory.purchasePriceChangeReason')}</th>
            <th className="px-3 py-2">{t('inventory.changedBy')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2">{new Date(item.effectiveDate).toLocaleString()}</td>
              <td className="px-3 py-2">¥{Number(item.oldPriceYuan).toFixed(2)}</td>
              <td className="px-3 py-2">¥{Number(item.newPriceYuan).toFixed(2)}</td>
              <td className={`px-3 py-2 font-semibold ${item.differenceYuan > 0 ? 'text-red-600' : item.differenceYuan < 0 ? 'text-green-600' : ''}`}>
                {item.differenceYuan > 0
                  ? t('procurement.orders.priceIncreased').replace('{amount}', Number(item.differenceYuan).toFixed(2))
                  : item.differenceYuan < 0
                    ? t('procurement.orders.priceDecreased').replace('{amount}', Number(item.differenceYuan).toFixed(2))
                    : '0'}
              </td>
              <td className="px-3 py-2">{t(`inventory.purchasePriceReason.${item.reason}`)}</td>
              <td className="px-3 py-2">{item.changedBy?.fullName ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function formatYuan(value: number | string | null | undefined) {
  return `¥${Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function categoryName(category: ProductCategory, language: string) {
  if (language === 'ky') return category.nameKy;
  if (language === 'ru') return category.nameRu;
  return category.nameEn;
}
