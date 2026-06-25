'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Product, ProductListResponse, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = { id: string; name: string };
type Factory = { id: string; name: string; supplierId: string };

export default function NewProcurementOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplierId: '',
    factoryId: '',
    hqWarehouseId: '',
    estimatedArrivalDate: '',
    note: '',
    productId: '',
    quantity: '1',
    purchasePriceYuan: '0',
    yuanRate: '0',
    transportCostKgs: '0',
    weightKg: '0',
  });

  useEffect(() => {
    Promise.all([
      apiFetch<Supplier[]>('/procurement/suppliers'),
      apiFetch<Factory[]>('/procurement/factories'),
      apiFetch<Warehouse[]>('/inventory/warehouses'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=200'),
    ])
      .then(([supplierResult, factoryResult, warehouseResult, productResult]) => {
        setSuppliers(supplierResult);
        setFactories(factoryResult);
        setWarehouses(warehouseResult);
        setProducts(productResult.items);
        setForm((current) => ({
          ...current,
          supplierId: supplierResult[0]?.id ?? '',
          factoryId: factoryResult[0]?.id ?? '',
          hqWarehouseId: warehouseResult[0]?.id ?? '',
          productId: productResult.items[0]?.id ?? '',
          yuanRate: current.yuanRate === '0' ? String(productResult.items[0]?.latestYuanRate ?? 0) : current.yuanRate,
          purchasePriceYuan: current.purchasePriceYuan === '0' ? String(productResult.items[0]?.purchasePriceYuan ?? 0) : current.purchasePriceYuan,
          weightKg: current.weightKg === '0' ? String(productResult.items[0]?.weightKg ?? 0) : current.weightKg,
        }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const totals = useMemo(() => {
    const quantity = Number(form.quantity || 0);
    const purchasePriceYuan = Number(form.purchasePriceYuan || 0);
    const yuanRate = Number(form.yuanRate || 0);
    const transportCostKgs = Number(form.transportCostKgs || 0);
    return {
      totalYuan: quantity * purchasePriceYuan,
      totalCostKgs: quantity * (purchasePriceYuan * yuanRate + transportCostKgs),
    };
  }, [form.purchasePriceYuan, form.quantity, form.transportCostKgs, form.yuanRate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/procurement/orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: form.supplierId,
          factoryId: form.factoryId || undefined,
          hqWarehouseId: form.hqWarehouseId,
          estimatedArrivalDate: form.estimatedArrivalDate || undefined,
          note: form.note || undefined,
          items: [{
            productId: form.productId,
            quantity: Number(form.quantity || 0),
            purchasePriceYuan: Number(form.purchasePriceYuan || 0),
            yuanRate: Number(form.yuanRate || 0),
            transportCostKgs: Number(form.transportCostKgs || 0),
            weightKg: Number(form.weightKg || 0),
          }],
        }),
      });
      window.localStorage.setItem('emotors_procurement_success', t('procurement.orders.created'));
      router.push('/procurement/orders');
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
          <Link href="/procurement/orders" className="text-sm font-semibold text-blue-700">{t('procurement.orders.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.orders.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <Select label={t('procurement.orders.supplier')} value={form.supplierId} onChange={(value) => setField('supplierId', value)} options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} />
            <Select label={t('procurement.orders.factory')} value={form.factoryId} onChange={(value) => setField('factoryId', value)} options={[{ value: '', label: '-' }, ...factories.map((factory) => ({ value: factory.id, label: factory.name }))]} />
            <Select label={t('procurement.orders.warehouse')} value={form.hqWarehouseId} onChange={(value) => setField('hqWarehouseId', value)} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} />
            <Input label={t('procurement.orders.estimatedArrivalDate')} type="date" value={form.estimatedArrivalDate} onChange={(value) => setField('estimatedArrivalDate', value)} />
            <Select label={t('procurement.orders.product')} value={form.productId} onChange={(value) => {
              const product = products.find((item) => item.id === value);
              setForm((current) => ({
                ...current,
                productId: value,
                purchasePriceYuan: product ? String(product.purchasePriceYuan ?? 0) : current.purchasePriceYuan,
                yuanRate: product ? String(product.latestYuanRate ?? 0) : current.yuanRate,
                weightKg: product ? String(product.weightKg ?? 0) : current.weightKg,
              }));
            }} options={products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }))} />
            <Input label={t('procurement.orders.quantity')} type="number" value={form.quantity} onChange={(value) => setField('quantity', value)} />
            <Input label={t('procurement.orders.purchasePriceYuan')} type="number" value={form.purchasePriceYuan} onChange={(value) => setField('purchasePriceYuan', value)} />
            <Input label={t('procurement.orders.yuanRate')} type="number" value={form.yuanRate} onChange={(value) => setField('yuanRate', value)} />
            <Input label={t('inventory.transportCostKgs')} type="number" value={form.transportCostKgs} onChange={(value) => setField('transportCostKgs', value)} />
            <Input label={t('inventory.weightKg')} type="number" value={form.weightKg} onChange={(value) => setField('weightKg', value)} />
            <label className="block md:col-span-2"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.note')}</span><textarea value={form.note} onChange={(event) => setField('note', event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          </section>
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('procurement.orders.totalCostKgs')}</h3>
            <Preview label={t('procurement.orders.totalYuan')} value={`¥${totals.totalYuan.toFixed(2)}`} />
            <Preview label={t('procurement.orders.totalCostKgs')} value={formatKgs(totals.totalCostKgs)} />
            <button disabled={saving} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">{saving ? t('common.loading') : t('procurement.orders.save')}</button>
          </aside>
        </div>
      </form>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Preview({ label, value }: { label: string; value: string }) {
  return <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
