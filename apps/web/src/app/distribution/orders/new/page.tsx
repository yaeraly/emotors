'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Branch, BranchDistributionOrder, Product, ProductListResponse, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ItemForm = { productId: string; quantity: string; unitPrice: string };

export default function NewDistributionOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchId, setBranchId] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemForm[]>([{ productId: '', quantity: '1', unitPrice: '0' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Branch[]>('/branches'),
      apiFetch<Warehouse[]>('/inventory/warehouses'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=200'),
    ])
      .then(([branchResult, warehouseResult, productResult]) => {
        setBranches(branchResult);
        setWarehouses(warehouseResult);
        setProducts(productResult.items);
        setBranchId(branchResult[0]?.id ?? '');
        setSourceWarehouseId(warehouseResult[0]?.id ?? '');
        setDestinationWarehouseId(warehouseResult[0]?.id ?? '');
        setItems([{ productId: productResult.items[0]?.id ?? '', quantity: '1', unitPrice: '0' }]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      const product = products.find((entry) => entry.id === item.productId);
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const unitCost = Number(product?.finalCostKgs ?? 0);
      acc.totalAmount += quantity * unitPrice;
      acc.totalCost += quantity * unitCost;
      return acc;
    }, { totalAmount: 0, totalCost: 0 });
  }, [items, products]);

  function setItem(index: number, updates: Partial<ItemForm>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const order = await apiFetch<BranchDistributionOrder>('/distribution/orders', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          sourceWarehouseId,
          destinationWarehouseId,
          note,
          items: items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
        }),
      });
      router.push(`/distribution/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('distribution.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('distribution.newOrder')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
          <Select label={t('distribution.branch')} value={branchId} onChange={setBranchId} options={branches.map((branch) => ({ value: branch.id, label: branch.name }))} />
          <Select label={t('distribution.sourceWarehouse')} value={sourceWarehouseId} onChange={setSourceWarehouseId} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} />
          <Select label={t('distribution.destinationWarehouse')} value={destinationWarehouseId} onChange={setDestinationWarehouseId} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} />
          <label className="block md:col-span-3"><span className="text-sm font-semibold text-slate-700">Note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex justify-between"><h3 className="text-lg font-bold">{t('distribution.items')}</h3><button onClick={() => setItems([...items, { productId: products[0]?.id ?? '', quantity: '1', unitPrice: '0' }])} type="button" className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700">{t('sales.addItem')}</button></div>
          <div className="mt-4 space-y-3">
            {items.map((item, index) => {
              const product = products.find((entry) => entry.id === item.productId);
              return <div key={index} className="grid gap-3 rounded-2xl bg-slate-50 p-3 md:grid-cols-5">
                <Select label={t('sales.product')} value={item.productId} onChange={(value) => setItem(index, { productId: value })} options={products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }))} />
                <Input label={t('distribution.quantity')} type="number" value={item.quantity} onChange={(value) => setItem(index, { quantity: value })} />
                <Input label={t('distribution.unitPrice')} type="number" value={item.unitPrice} onChange={(value) => setItem(index, { unitPrice: value })} />
                <div className="rounded-xl bg-white p-3 text-sm"><p className="text-slate-400">{t('distribution.unitCost')}</p><p className="font-bold">{formatKgs(product?.finalCostKgs)}</p></div>
                <button onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1} type="button" className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">{t('common.delete')}</button>
              </div>;
            })}
          </div>
        </section>
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
          <Summary label={t('distribution.totalAmount')} value={formatKgs(totals.totalAmount)} />
          <Summary label={t('distribution.totalCost')} value={formatKgs(totals.totalCost)} />
          <Summary label={t('distribution.totalProfit')} value={formatKgs(totals.totalAmount - totals.totalCost)} />
          <button disabled={saving} type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-3">{saving ? t('common.loading') : t('distribution.saveDraft')}</button>
        </section>
      </form>
    </ProtectedShell>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input type={type} min={type === 'number' ? 0 : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}
function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="text-xl font-bold">{value}</p></div>;
}
function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
