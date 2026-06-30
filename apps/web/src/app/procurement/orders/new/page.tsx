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
type ProductMasterData = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  weightKg: number;
  purchasePriceYuan: number;
  defaultSupplierId: string | null;
  defaultFactoryId: string | null;
  weightConfigured: boolean;
};

type LineItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  supplierId: string;
  factoryId: string;
  quantity: string;
  purchasePriceYuan: string;
  weightKg: number;
  totalWeightKg: number;
  totalYuan: number;
  totalCostKgs: number;
  weightError?: string;
};

function emptyLine(supplierId = '', factoryId = ''): LineItem {
  return {
    id: crypto.randomUUID(),
    productId: '',
    productName: '',
    sku: '',
    unit: 'pcs',
    supplierId,
    factoryId,
    quantity: '1',
    purchasePriceYuan: '0',
    weightKg: 0,
    totalWeightKg: 0,
    totalYuan: 0,
    totalCostKgs: 0,
  };
}

export default function NewProcurementOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState({
    supplierId: '',
    factoryId: '',
    hqWarehouseId: '',
    currency: 'CNY',
    exchangeRate: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
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
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  useEffect(() => {
    Promise.all([
      apiFetch<Supplier[]>('/procurement/suppliers'),
      apiFetch<Factory[]>('/procurement/factories'),
      apiFetch<Warehouse[]>('/inventory/warehouses'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=500'),
      apiFetch<{ rate?: number | string }>('/inventory/yuan-rates/latest').catch(() => ({ rate: 0 })),
    ])
      .then(([supplierResult, factoryResult, warehouseResult, productResult, latestRate]) => {
        setSuppliers(supplierResult);
        setFactories(factoryResult);
        setWarehouses(warehouseResult);
        setProducts(productResult.items);
        const supplierId = supplierResult[0]?.id ?? '';
        const factoryId = factoryResult[0]?.id ?? '';
        setHeader((current) => ({
          ...current,
          supplierId,
          factoryId,
          hqWarehouseId: warehouseResult[0]?.id ?? '',
          exchangeRate: String(latestRate?.rate ?? productResult.items[0]?.latestYuanRate ?? 0),
        }));
        setLines([emptyLine(supplierId, factoryId)]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const exchangeRate = Number(header.exchangeRate || 0);

  const totals = useMemo(() => {
    const totalProducts = lines.filter((line) => line.productId).length;
    const totalQuantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const shipmentWeight = lines.reduce((sum, line) => sum + line.totalWeightKg, 0);
    const totalYuan = lines.reduce((sum, line) => sum + line.totalYuan, 0);
    const factoryCostKgs = lines.reduce((sum, line) => sum + line.totalCostKgs, 0);
    const transportTotal =
      Number(header.chinaDomesticTransportKgs || 0) +
      Number(header.chinaExportTransportKgs || 0) +
      Number(header.localTransportKgs || 0) +
      Number(header.packagingCostKgs || 0) +
      Number(header.customsKgs || 0) +
      Number(header.insuranceKgs || 0) +
      Number(header.bankFeesKgs || 0) +
      Number(header.otherExpensesKgs || 0);
    const costPerKg = shipmentWeight > 0 ? transportTotal / shipmentWeight : 0;
    const estimatedLandedCost = factoryCostKgs + transportTotal;
    return { totalProducts, totalQuantity, shipmentWeight, totalYuan, factoryCostKgs, transportTotal, costPerKg, estimatedLandedCost };
  }, [header, lines]);

  async function loadProduct(lineId: string, productId: string) {
    if (!productId) {
      setLines((current) => current.map((line) => (line.id === lineId ? emptyLine(header.supplierId, header.factoryId) : line)));
      return;
    }
    try {
      const master = await apiFetch<ProductMasterData>(`/procurement/products/${productId}/master-data`);
      const quantity = Number(lines.find((line) => line.id === lineId)?.quantity || 1);
      const purchasePriceYuan = master.purchasePriceYuan;
      const totalWeightKg = master.weightKg * quantity;
      const totalYuan = purchasePriceYuan * quantity;
      const totalCostKgs = totalYuan * exchangeRate;
      setLines((current) => current.map((line) => line.id === lineId ? {
        ...line,
        productId,
        productName: master.name,
        sku: master.sku,
        unit: master.unit,
        supplierId: master.defaultSupplierId ?? header.supplierId,
        factoryId: master.defaultFactoryId ?? header.factoryId,
        purchasePriceYuan: String(purchasePriceYuan),
        weightKg: master.weightKg,
        totalWeightKg,
        totalYuan,
        totalCostKgs,
        weightError: master.weightConfigured ? undefined : 'Product weight is not configured.',
      } : line));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function updateLine(lineId: string, patch: Partial<LineItem>) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const next = { ...line, ...patch };
      const quantity = Number(next.quantity || 0);
      const purchasePriceYuan = Number(next.purchasePriceYuan || 0);
      next.totalWeightKg = next.weightKg * quantity;
      next.totalYuan = purchasePriceYuan * quantity;
      next.totalCostKgs = next.totalYuan * exchangeRate;
      return next;
    }));
  }

  useEffect(() => {
    setLines((current) => current.map((line) => {
      const quantity = Number(line.quantity || 0);
      const purchasePriceYuan = Number(line.purchasePriceYuan || 0);
      return {
        ...line,
        totalWeightKg: line.weightKg * quantity,
        totalYuan: purchasePriceYuan * quantity,
        totalCostKgs: purchasePriceYuan * quantity * exchangeRate,
      };
    }));
  }, [exchangeRate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const invalidLine = lines.find((line) => line.productId && line.weightError);
    if (invalidLine) {
      setError(invalidLine.weightError ?? 'Product weight is not configured.');
      return;
    }
    const validLines = lines.filter((line) => line.productId);
    if (!validLines.length) {
      setError('Add at least one product');
      return;
    }
    if (exchangeRate <= 0) {
      setError('Exchange rate is required');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/procurement/orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: header.supplierId,
          factoryId: header.factoryId || undefined,
          hqWarehouseId: header.hqWarehouseId,
          currency: header.currency,
          exchangeRate,
          purchaseDate: header.purchaseDate || undefined,
          estimatedArrivalDate: header.estimatedArrivalDate || undefined,
          note: header.note || undefined,
          chinaLocalShippingKgs: Number(header.chinaDomesticTransportKgs || 0),
          internationalShippingKgs: Number(header.chinaExportTransportKgs || 0),
          localTransportKgs: Number(header.localTransportKgs || 0),
          packagingCostKgs: Number(header.packagingCostKgs || 0),
          customsKgs: Number(header.customsKgs || 0),
          insuranceKgs: Number(header.insuranceKgs || 0),
          bankFeesKgs: Number(header.bankFeesKgs || 0),
          otherExpensesKgs: Number(header.otherExpensesKgs || 0),
          items: validLines.map((line) => ({
            productId: line.productId,
            supplierId: line.supplierId || header.supplierId,
            factoryId: line.factoryId || header.factoryId || undefined,
            quantity: Number(line.quantity || 0),
            purchasePriceYuan: Number(line.purchasePriceYuan || 0),
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

  return (
    <ProtectedShell>
      <form onSubmit={submit} className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/procurement/orders" className="text-sm font-semibold text-blue-700">{t('procurement.orders.title')}</Link>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.orders.new')}</h2>
            <p className="mt-1 text-sm text-slate-500">Professional procurement workflow with automatic product loading and landed cost preview.</p>
          </div>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <SummaryCard label="Total Products" value={String(totals.totalProducts)} />
          <SummaryCard label="Total Quantity" value={String(totals.totalQuantity)} />
          <SummaryCard label="Shipment Weight" value={`${totals.shipmentWeight.toFixed(2)} kg`} />
          <SummaryCard label="Total Yuan" value={`¥${totals.totalYuan.toFixed(2)}`} />
          <SummaryCard label="Total KGS" value={formatKgs(totals.factoryCostKgs)} />
          <SummaryCard label="Est. Landed Cost" value={formatKgs(totals.estimatedLandedCost)} />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-900">Section 1 — Shipment Information</h3>
            <p className="text-sm text-slate-500">Common shipment data entered once per procurement order.</p>
          </div>
          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <Select label="Supplier" value={header.supplierId} onChange={(value) => setHeader((c) => ({ ...c, supplierId: value }))} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
            <Select label="Default Factory" value={header.factoryId} onChange={(value) => setHeader((c) => ({ ...c, factoryId: value }))} options={[{ value: '', label: '-' }, ...factories.map((f) => ({ value: f.id, label: f.name }))]} />
            <Select label="HQ Warehouse" value={header.hqWarehouseId} onChange={(value) => setHeader((c) => ({ ...c, hqWarehouseId: value }))} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            <Input label="Currency" value={header.currency} onChange={(value) => setHeader((c) => ({ ...c, currency: value }))} readOnly />
            <Input label="Exchange Rate (1 Yuan = KGS)" type="number" value={header.exchangeRate} onChange={(value) => setHeader((c) => ({ ...c, exchangeRate: value }))} />
            <Input label="Purchase Date" type="date" value={header.purchaseDate} onChange={(value) => setHeader((c) => ({ ...c, purchaseDate: value }))} />
            <Input label="Expected Arrival" type="date" value={header.estimatedArrivalDate} onChange={(value) => setHeader((c) => ({ ...c, estimatedArrivalDate: value }))} />
            <Input label="Cost per Kg Preview" value={formatKgs(totals.costPerKg)} readOnly />
          </div>
          <div className="grid gap-4 border-t border-slate-100 px-6 py-4 md:grid-cols-2 xl:grid-cols-4">
            <Input label="China Domestic (Factory → China WH)" type="number" value={header.chinaDomesticTransportKgs} onChange={(v) => setHeader((c) => ({ ...c, chinaDomesticTransportKgs: v }))} />
            <Input label="China Export (China WH → Bishkek)" type="number" value={header.chinaExportTransportKgs} onChange={(v) => setHeader((c) => ({ ...c, chinaExportTransportKgs: v }))} />
            <Input label="Bishkek SVH → EMOTORS HQ" type="number" value={header.localTransportKgs} onChange={(v) => setHeader((c) => ({ ...c, localTransportKgs: v }))} />
            <Input label="Packaging" type="number" value={header.packagingCostKgs} onChange={(v) => setHeader((c) => ({ ...c, packagingCostKgs: v }))} />
            <Input label="Insurance" type="number" value={header.insuranceKgs} onChange={(v) => setHeader((c) => ({ ...c, insuranceKgs: v }))} />
            <Input label="Customs" type="number" value={header.customsKgs} onChange={(v) => setHeader((c) => ({ ...c, customsKgs: v }))} />
            <Input label="Bank Fees" type="number" value={header.bankFeesKgs} onChange={(v) => setHeader((c) => ({ ...c, bankFeesKgs: v }))} />
            <Input label="Other Expenses" type="number" value={header.otherExpensesKgs} onChange={(v) => setHeader((c) => ({ ...c, otherExpensesKgs: v }))} />
          </div>
          <div className="px-6 pb-6">
            <label className="block"><span className="text-sm font-semibold text-slate-700">Notes</span><textarea value={header.note} onChange={(e) => setHeader((c) => ({ ...c, note: e.target.value }))} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Section 2 — Products</h3>
              <p className="text-sm text-slate-500">Select product, quantity, and purchase price. Weight and totals load automatically.</p>
            </div>
            <button type="button" onClick={() => setLines((c) => [...c, emptyLine(header.supplierId, header.factoryId)])} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Add Product</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Factory</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Weight/Unit</th>
                  <th className="px-4 py-3">Total Weight</th>
                  <th className="px-4 py-3">Price ¥</th>
                  <th className="px-4 py-3">Total ¥</th>
                  <th className="px-4 py-3">Total KGS</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => (
                  <tr key={line.id} className={line.weightError ? 'bg-red-50' : undefined}>
                    <td className="px-4 py-3 min-w-[220px]">
                      <select value={line.productId} onChange={(e) => void loadProduct(line.id, e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                        <option value="">Select product</option>
                        {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                      </select>
                      {line.weightError ? <p className="mt-1 text-xs text-red-600">{line.weightError}</p> : null}
                    </td>
                    <td className="px-4 py-3">{line.sku || '—'}</td>
                    <td className="px-4 py-3 min-w-[160px]">
                      <select value={line.factoryId} onChange={(e) => updateLine(line.id, { factoryId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                        <option value="">—</option>
                        {factories.filter((f) => !line.supplierId || f.supplierId === line.supplierId).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3"><input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5" /></td>
                    <td className="px-4 py-3">{line.unit || 'pcs'}</td>
                    <td className="px-4 py-3">{line.weightKg > 0 ? `${line.weightKg.toFixed(2)} kg` : '—'}</td>
                    <td className="px-4 py-3">{line.totalWeightKg > 0 ? `${line.totalWeightKg.toFixed(2)} kg` : '—'}</td>
                    <td className="px-4 py-3"><input type="number" min={0} step="0.01" value={line.purchasePriceYuan} onChange={(e) => updateLine(line.id, { purchasePriceYuan: e.target.value })} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5" /></td>
                    <td className="px-4 py-3">¥{line.totalYuan.toFixed(2)}</td>
                    <td className="px-4 py-3">{formatKgs(line.totalCostKgs)}</td>
                    <td className="px-4 py-3"><button type="button" onClick={() => setLines((c) => c.length <= 1 ? c : c.filter((entry) => entry.id !== line.id))} className="text-red-600">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-end">
          <button disabled={saving} className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">
            {saving ? t('common.loading') : 'Create Procurement Order'}
          </button>
        </div>
      </form>
    </ProtectedShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-xl font-bold text-slate-950">{value}</p></div>;
}

function Input({ label, value, onChange, type = 'text', readOnly = false }: { label: string; value: string; onChange?: (value: string) => void; type?: string; readOnly?: boolean }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input readOnly={readOnly} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className={`mt-2 w-full rounded-xl border px-3 py-2 ${readOnly ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-300'}`} /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
