'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Product, Warehouse, YuanRateHistory } from '@/lib/types';

export default function NewProductPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
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
    ])
      .then(([warehouseResult, rate]) => {
        setWarehouses(warehouseResult);
        setForm((current) => ({
          ...current,
          warehouseId: warehouseResult[0]?.id ?? '',
          latestYuanRate: rate ? String(rate.rate) : current.latestYuanRate,
        }));
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load form data'),
      );
  }, []);

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
      const product = await apiFetch<Product>('/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          characteristics: form.characteristics
            ? JSON.parse(form.characteristics)
            : undefined,
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
      setError(err instanceof Error ? err.message : 'Could not create product');
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Products</p>
          <h2 className="text-3xl font-bold text-slate-950">Create product</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <Input label="Name" value={form.name} onChange={(value) => setField('name', value)} required />
            <Input label="SKU" value={form.sku} onChange={(value) => setField('sku', value)} required />
            <Input label="Category" value={form.category} onChange={(value) => setField('category', value)} required />
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Warehouse</span>
              <select value={form.warehouseId} onChange={(event) => setField('warehouseId', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <Input label="Photo URL" value={form.photoUrl} onChange={(value) => setField('photoUrl', value)} />
            <Input label="Weight kg" type="number" value={form.weightKg} onChange={(value) => setField('weightKg', value)} />
            <Input label="Purchase price ¥" type="number" value={form.purchasePriceYuan} onChange={(value) => setField('purchasePriceYuan', value)} />
            <Input label="Yuan rate" type="number" value={form.latestYuanRate} onChange={(value) => setField('latestYuanRate', value)} />
            <Input label="Transport cost/kg" type="number" value={form.transportCostPerKg} onChange={(value) => setField('transportCostPerKg', value)} />
            <Input label="Selling price KGS" type="number" value={form.sellingPriceKgs} onChange={(value) => setField('sellingPriceKgs', value)} />
            <Input label="Min stock" type="number" value={form.minStockLevel} onChange={(value) => setField('minStockLevel', value)} />
            <Input label="Initial quantity" type="number" value={form.initialQuantity} onChange={(value) => setField('initialQuantity', value)} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Description</span>
              <textarea value={form.description} onChange={(event) => setField('description', event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Characteristics JSON</span>
              <textarea value={form.characteristics} onChange={(event) => setField('characteristics', event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder='{"voltage":"60V"}' />
            </label>
          </section>
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Cost preview</h3>
            <Preview label="Purchase cost" value={formatKgs(preview.purchaseCostKgs)} />
            <Preview label="Transport cost" value={formatKgs(preview.transportCostKgs)} />
            <Preview label="Final cost" value={formatKgs(preview.finalCostKgs)} />
            <Preview label="Margin" value={formatKgs(preview.marginAmount)} />
            <Preview label="Margin %" value={`${preview.marginPercent.toFixed(2)}%`} />
            <button disabled={saving} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">
              {saving ? 'Saving...' : 'Create product'}
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
