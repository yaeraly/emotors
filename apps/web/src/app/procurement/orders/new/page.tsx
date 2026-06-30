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

type LineItem = {
  id: string;
  productId: string;
  supplierId: string;
  factoryId: string;
  quantity: string;
  purchasePriceYuan: string;
  yuanRate: string;
  weightKg: string;
  notes: string;
};

const emptyLine = (product?: Product, supplierId = '', factoryId = ''): LineItem => ({
  id: crypto.randomUUID(),
  productId: product?.id ?? '',
  supplierId,
  factoryId,
  quantity: '1',
  purchasePriceYuan: String(product?.purchasePriceYuan ?? 0),
  yuanRate: String(product?.latestYuanRate ?? 0),
  weightKg: String(product?.weightKg ?? 0),
  notes: '',
});

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
    chinaDomesticTransportKgs: '0',
    chinaExportTransportKgs: '0',
    localTransportKgs: '0',
    packagingCostKgs: '0',
    customsKgs: '0',
    insuranceKgs: '0',
    bankFeesKgs: '0',
    otherExpensesKgs: '0',
  });
  const [lines, setLines] = useState<LineItem[]>([]);

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
        const supplierId = supplierResult[0]?.id ?? '';
        const factoryId = factoryResult[0]?.id ?? '';
        setForm((current) => ({
          ...current,
          supplierId,
          factoryId,
          hqWarehouseId: warehouseResult[0]?.id ?? '',
        }));
        setLines([emptyLine(productResult.items[0], supplierId, factoryId)]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const totals = useMemo(() => {
    const totalYuan = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.purchasePriceYuan || 0), 0);
    const totalWeight = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.weightKg || 0), 0);
    const transportTotal =
      Number(form.chinaDomesticTransportKgs || 0) +
      Number(form.chinaExportTransportKgs || 0) +
      Number(form.localTransportKgs || 0) +
      Number(form.packagingCostKgs || 0) +
      Number(form.customsKgs || 0) +
      Number(form.insuranceKgs || 0) +
      Number(form.bankFeesKgs || 0) +
      Number(form.otherExpensesKgs || 0);
    const costPerKg = totalWeight > 0 ? transportTotal / totalWeight : 0;
    return { totalYuan, totalWeight, transportTotal, costPerKg };
  }, [form, lines]);

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
          chinaLocalShippingKgs: Number(form.chinaDomesticTransportKgs || 0),
          internationalShippingKgs: Number(form.chinaExportTransportKgs || 0),
          localTransportKgs: Number(form.localTransportKgs || 0),
          packagingCostKgs: Number(form.packagingCostKgs || 0),
          customsKgs: Number(form.customsKgs || 0),
          insuranceKgs: Number(form.insuranceKgs || 0),
          bankFeesKgs: Number(form.bankFeesKgs || 0),
          otherExpensesKgs: Number(form.otherExpensesKgs || 0),
          items: lines.map((line) => ({
            productId: line.productId,
            supplierId: line.supplierId || form.supplierId,
            factoryId: line.factoryId || form.factoryId || undefined,
            quantity: Number(line.quantity || 0),
            purchasePriceYuan: Number(line.purchasePriceYuan || 0),
            yuanRate: Number(line.yuanRate || 0),
            weightKg: Number(line.weightKg || 0),
            notes: line.notes || undefined,
          })),
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

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((current) => [...current, emptyLine(products[0], form.supplierId, form.factoryId)]);
  }

  function removeLine(id: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.id !== id)));
  }

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div>
          <Link href="/procurement/orders" className="text-sm font-semibold text-blue-700">{t('procurement.orders.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.orders.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <h3 className="md:col-span-2 text-lg font-bold">General Information</h3>
          <Select label={t('procurement.orders.supplier')} value={form.supplierId} onChange={(value) => setForm((c) => ({ ...c, supplierId: value }))} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          <Select label={t('procurement.orders.factory')} value={form.factoryId} onChange={(value) => setForm((c) => ({ ...c, factoryId: value }))} options={[{ value: '', label: '-' }, ...factories.map((f) => ({ value: f.id, label: f.name }))]} />
          <Select label={t('procurement.orders.warehouse')} value={form.hqWarehouseId} onChange={(value) => setForm((c) => ({ ...c, hqWarehouseId: value }))} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
          <Input label={t('procurement.orders.estimatedArrivalDate')} type="date" value={form.estimatedArrivalDate} onChange={(value) => setForm((c) => ({ ...c, estimatedArrivalDate: value }))} />
          <label className="block md:col-span-2"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.note')}</span><textarea value={form.note} onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">Products</h3>
            <button type="button" onClick={addLine} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Add Product</button>
          </div>
          <div className="space-y-4">
            {lines.map((line) => (
              <div key={line.id} className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-4">
                <Select label="Product" value={line.productId} onChange={(value) => {
                  const product = products.find((p) => p.id === value);
                  updateLine(line.id, {
                    productId: value,
                    purchasePriceYuan: String(product?.purchasePriceYuan ?? 0),
                    yuanRate: String(product?.latestYuanRate ?? 0),
                    weightKg: String(product?.weightKg ?? 0),
                  });
                }} options={products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }))} />
                <Select label="Supplier" value={line.supplierId} onChange={(value) => updateLine(line.id, { supplierId: value })} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                <Select label="Factory" value={line.factoryId} onChange={(value) => updateLine(line.id, { factoryId: value })} options={[{ value: '', label: '-' }, ...factories.filter((f) => !line.supplierId || f.supplierId === line.supplierId).map((f) => ({ value: f.id, label: f.name }))]} />
                <Input label="Qty" type="number" value={line.quantity} onChange={(value) => updateLine(line.id, { quantity: value })} />
                <Input label="Price ¥" type="number" value={line.purchasePriceYuan} onChange={(value) => updateLine(line.id, { purchasePriceYuan: value })} />
                <Input label="Yuan Rate" type="number" value={line.yuanRate} onChange={(value) => updateLine(line.id, { yuanRate: value })} />
                <Input label="Weight kg/unit" type="number" value={line.weightKg} onChange={(value) => updateLine(line.id, { weightKg: value })} />
                <Input label="Notes" value={line.notes} onChange={(value) => updateLine(line.id, { notes: value })} />
                <div className="flex items-end">
                  <button type="button" onClick={() => removeLine(line.id)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
          <h3 className="md:col-span-4 text-lg font-bold">Transportation Costs</h3>
          <Input label="China Domestic (Factory → China WH)" type="number" value={form.chinaDomesticTransportKgs} onChange={(v) => setForm((c) => ({ ...c, chinaDomesticTransportKgs: v }))} />
          <Input label="China Export (China WH → Bishkek)" type="number" value={form.chinaExportTransportKgs} onChange={(v) => setForm((c) => ({ ...c, chinaExportTransportKgs: v }))} />
          <Input label="Local (Customs/SVH → HQ)" type="number" value={form.localTransportKgs} onChange={(v) => setForm((c) => ({ ...c, localTransportKgs: v }))} />
          <Input label="Packaging" type="number" value={form.packagingCostKgs} onChange={(v) => setForm((c) => ({ ...c, packagingCostKgs: v }))} />
          <Input label="Customs" type="number" value={form.customsKgs} onChange={(v) => setForm((c) => ({ ...c, customsKgs: v }))} />
          <Input label="Insurance" type="number" value={form.insuranceKgs} onChange={(v) => setForm((c) => ({ ...c, insuranceKgs: v }))} />
          <Input label="Bank Fees" type="number" value={form.bankFeesKgs} onChange={(v) => setForm((c) => ({ ...c, bankFeesKgs: v }))} />
          <Input label="Other Expenses" type="number" value={form.otherExpensesKgs} onChange={(v) => setForm((c) => ({ ...c, otherExpensesKgs: v }))} />
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">Weight & Cost Preview</h3>
          <Preview label={t('procurement.orders.totalYuan')} value={`¥${totals.totalYuan.toFixed(2)}`} />
          <Preview label="Total Weight" value={`${totals.totalWeight.toFixed(2)} kg`} />
          <Preview label="Total Transportation" value={formatKgs(totals.transportTotal)} />
          <Preview label="Cost per Kg" value={formatKgs(totals.costPerKg)} />
          <button disabled={saving} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">{saving ? t('common.loading') : t('procurement.orders.save')}</button>
        </aside>
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
