'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Product, ProductCategory } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function ProductDetailPage() {
  const { t, language } = useTranslation();
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [editForm, setEditForm] = useState({
    name: '',
    sku: '',
    categoryId: '',
    sellingPriceKgs: '0',
    minStockLevel: '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Product>(`/inventory/products/${params.id}`),
      apiFetch<ProductCategory[]>('/inventory/categories'),
    ])
      .then(([productResult, categoryResult]) => {
        setProduct(productResult);
        setCategories(categoryResult);
        setEditForm({
          name: productResult.name,
          sku: productResult.sku,
          categoryId: productResult.categoryId,
          sellingPriceKgs: String(productResult.sellingPriceKgs),
          minStockLevel: String(productResult.minStockLevel),
        });
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('common.error')),
      );
  }, [params.id, t]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (!editForm.categoryId) {
        setError(t('inventory.categoryRequired'));
        return;
      }

      const updated = await apiFetch<Product>(`/inventory/products/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name,
          sku: editForm.sku,
          categoryId: editForm.categoryId,
          sellingPriceKgs: Number(editForm.sellingPriceKgs),
          minStockLevel: Number(editForm.minStockLevel),
        }),
      });
      setProduct(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <Link href="/products" className="text-sm font-semibold text-blue-700">{t('inventory.products')}</Link>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {product ? (
          <>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 md:flex-row">
                {product.photoUrl ? <img src={product.photoUrl} alt="" className="h-40 w-40 rounded-3xl object-cover" /> : <div className="h-40 w-40 rounded-3xl bg-slate-100" />}
                <div className="flex-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{product.sku}</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-950">{product.name}</h2>
                  <p className="mt-2 text-slate-500">{product.description}</p>
                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <Info label={t('inventory.category')} value={product.productCategory ? categoryName(product.productCategory, language) : product.category} />
                    <Info label={t('inventory.warehouse')} value={product.warehouse?.name ?? ''} />
                    <Info label={t('inventory.quantity')} value={String(product.quantity)} />
                    <Info label={t('inventory.lowStock')} value={product.lowStock ? t('inventory.lowStockAlert') : t('inventory.inStock')} />
                  </div>
                </div>
              </div>
            </article>

            <form onSubmit={saveProduct} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-5">
              <Input label={t('inventory.name')} value={editForm.name} onChange={(value) => setEditForm({ ...editForm, name: value })} />
              <Input label={t('inventory.sku')} value={editForm.sku} onChange={(value) => setEditForm({ ...editForm, sku: value })} />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('inventory.category')}</span>
                <select value={editForm.categoryId} onChange={(event) => setEditForm({ ...editForm, categoryId: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" required>
                  <option value="">{t('inventory.selectCategory')}</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{categoryName(category, language)}</option>)}
                </select>
              </label>
              <Input label={t('inventory.sellingPriceKgs')} type="number" value={editForm.sellingPriceKgs} onChange={(value) => setEditForm({ ...editForm, sellingPriceKgs: value })} />
              <Input label={t('inventory.minStockLevel')} type="number" value={editForm.minStockLevel} onChange={(value) => setEditForm({ ...editForm, minStockLevel: value })} />
              <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-5" type="submit">{saving ? t('common.loading') : t('common.save')}</button>
            </form>

            <div className="grid gap-6 xl:grid-cols-3">
              <Panel title={t('inventory.productDetail')}>
                <Info label={t('inventory.purchasePriceYuan')} value={formatYuan(product.purchasePriceYuan)} />
                <Info label={t('inventory.latestYuanRate')} value={String(product.latestYuanRate)} />
                <Info label={t('inventory.finalCostKgs')} value={formatKgs(product.finalCostKgs)} />
                <Info label={t('inventory.sellingPriceKgs')} value={formatKgs(product.sellingPriceKgs)} />
                <Info label={t('inventory.marginAmount')} value={`${formatKgs(product.marginAmount)} (${Number(product.marginPercent).toFixed(2)}%)`} />
              </Panel>
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

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
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
