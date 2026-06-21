'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Product, ProductCategory, Warehouse, YuanRateHistory } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function NewProductPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    categoryId: '',
    photoUrl: '',
    description: '',
    characteristics: '',
    weightKg: '0',
    purchasePriceYuan: '0',
    latestYuanRate: '0',
    transportCostPerKg: '0',
    sellingPriceKgs: '0',
    minStockLevel: '0',
    initialQuantity: '0',
    warehouseId: '',
  });

  useEffect(() => {
    Promise.all([
      apiFetch<Warehouse[]>('/inventory/warehouses'),
      apiFetch<YuanRateHistory | null>('/inventory/yuan-rates/latest'),
      apiFetch<ProductCategory[]>('/inventory/categories'),
    ])
      .then(([warehouseResult, rate, categoryResult]) => {
        setWarehouses(warehouseResult);
        setCategories(categoryResult);
        setForm((current) => ({
          ...current,
          warehouseId: warehouseResult[0]?.id ?? '',
          categoryId: categoryResult[0]?.id ?? '',
          latestYuanRate: rate ? String(rate.rate) : current.latestYuanRate,
        }));
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('common.error')),
      );
  }, [t]);

  const preview = useMemo(() => {
    const purchaseCostKgs =
      Number(form.purchasePriceYuan || 0) * Number(form.latestYuanRate || 0);
    const transportCostKgs =
      Number(form.weightKg || 0) * Number(form.transportCostPerKg || 0);
    const finalCostKgs = purchaseCostKgs + transportCostKgs;
    const marginAmount = Number(form.sellingPriceKgs || 0) - finalCostKgs;
    const marginPercent =
      Number(form.sellingPriceKgs || 0) === 0
        ? 0
        : (marginAmount / Number(form.sellingPriceKgs || 0)) * 100;
    return { purchaseCostKgs, transportCostKgs, finalCostKgs, marginAmount, marginPercent };
  }, [form]);

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

      const product = await apiFetch<Product>('/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          characteristics: form.characteristics
            ? JSON.parse(form.characteristics)
            : undefined,
          categoryId: form.categoryId,
          weightKg: Number(form.weightKg),
          purchasePriceYuan: Number(form.purchasePriceYuan),
          latestYuanRate: Number(form.latestYuanRate),
          transportCostPerKg: Number(form.transportCostPerKg),
          sellingPriceKgs: Number(form.sellingPriceKgs),
          minStockLevel: Number(form.minStockLevel),
          initialQuantity: Number(form.initialQuantity),
        }),
      });
      router.push(`/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('inventory.products')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('inventory.createProduct')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <Input label={t('inventory.name')} value={form.name} onChange={(value) => setField('name', value)} required />
            <Input label={t('inventory.sku')} value={form.sku} onChange={(value) => setField('sku', value)} required />
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('inventory.category')}</span>
              <select value={form.categoryId} onChange={(event) => setField('categoryId', event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="">{t('inventory.selectCategory')}</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{categoryName(category, language)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('inventory.warehouse')}</span>
              <select value={form.warehouseId} onChange={(event) => setField('warehouseId', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <Input label={t('inventory.photo')} value={form.photoUrl} onChange={(value) => setField('photoUrl', value)} />
            <Input label={t('inventory.weightKg')} type="number" value={form.weightKg} onChange={(value) => setField('weightKg', value)} />
            <Input label={t('inventory.purchasePriceYuan')} type="number" value={form.purchasePriceYuan} onChange={(value) => setField('purchasePriceYuan', value)} />
            <Input label={t('inventory.latestYuanRate')} type="number" value={form.latestYuanRate} onChange={(value) => setField('latestYuanRate', value)} />
            <Input label={t('inventory.transportCost')} type="number" value={form.transportCostPerKg} onChange={(value) => setField('transportCostPerKg', value)} />
            <Input label={t('inventory.sellingPriceKgs')} type="number" value={form.sellingPriceKgs} onChange={(value) => setField('sellingPriceKgs', value)} />
            <Input label={t('inventory.minStockLevel')} type="number" value={form.minStockLevel} onChange={(value) => setField('minStockLevel', value)} />
            <Input label={t('inventory.initialQuantity')} type="number" value={form.initialQuantity} onChange={(value) => setField('initialQuantity', value)} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('inventory.description')}</span>
              <textarea value={form.description} onChange={(event) => setField('description', event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('inventory.characteristics')}</span>
              <textarea value={form.characteristics} onChange={(event) => setField('characteristics', event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder='{"voltage":"60V"}' />
            </label>
          </section>
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('inventory.costPreview')}</h3>
            <Preview label={t('inventory.purchaseCostKgs')} value={formatKgs(preview.purchaseCostKgs)} />
            <Preview label={t('inventory.transportCostKgs')} value={formatKgs(preview.transportCostKgs)} />
            <Preview label={t('inventory.finalCostKgs')} value={formatKgs(preview.finalCostKgs)} />
            <Preview label={t('inventory.marginAmount')} value={formatKgs(preview.marginAmount)} />
            <Preview label={t('inventory.marginPercent')} value={`${preview.marginPercent.toFixed(2)}%`} />
            <button disabled={saving} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">
              {saving ? t('common.loading') : t('inventory.createProduct')}
            </button>
          </aside>
        </div>
      </form>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
    </label>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function categoryName(category: ProductCategory, language: string) {
  if (language === 'ky') return category.nameKy;
  if (language === 'ru') return category.nameRu;
  return category.nameEn;
}
