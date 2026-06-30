'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { calculateLandedCosts } from '@/lib/landed-cost';
import type { Product, ProductListResponse, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = { id: string; name: string };
type Factory = { id: string; name: string; supplierId: string };
type OrderLine = { key: string; productId: string; supplierId: string; factoryId: string; quantity: string; purchasePriceYuan: string; yuanRate: string; weightKg: string; note: string };

export default function EditProcurementOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplierId: '', factoryId: '', hqWarehouseId: '', defaultYuanRate: '0', estimatedArrivalDate: '', note: '',
    chinaDomesticTransportKgs: '0', chinaExportTransportKgs: '0', localTransportKgs: '0', packagingCostKgs: '0',
    customsCostKgs: '0', insuranceCostKgs: '0', bankFeeCostKgs: '0', otherExpenseKgs: '0',
  });
  const [lines, setLines] = useState<OrderLine[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<Supplier[]>('/procurement/suppliers'),
      apiFetch<Factory[]>('/procurement/factories'),
      apiFetch<Warehouse[]>('/inventory/warehouses'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=200'),
      apiFetch<any>(`/procurement/orders/${id}`),
    ]).then(([supplierResult, factoryResult, warehouseResult, productResult, order]) => {
      setSuppliers(supplierResult);
      setFactories(factoryResult);
      setWarehouses(warehouseResult);
      setProducts(productResult.items);
      setForm({
        supplierId: order.supplierId,
        factoryId: order.factoryId ?? '',
        hqWarehouseId: order.hqWarehouseId,
        defaultYuanRate: String(order.defaultYuanRate ?? 0),
        estimatedArrivalDate: order.estimatedArrivalDate ? order.estimatedArrivalDate.slice(0, 10) : '',
        note: order.note ?? '',
        chinaDomesticTransportKgs: String(order.chinaDomesticTransportKgs ?? 0),
        chinaExportTransportKgs: String(order.chinaExportTransportKgs ?? 0),
        localTransportKgs: String(order.localTransportKgs ?? 0),
        packagingCostKgs: String(order.packagingCostKgs ?? 0),
        customsCostKgs: String(order.customsCostKgs ?? 0),
        insuranceCostKgs: String(order.insuranceCostKgs ?? 0),
        bankFeeCostKgs: String(order.bankFeeCostKgs ?? 0),
        otherExpenseKgs: String(order.otherExpenseKgs ?? 0),
      });
      setLines((order.items ?? []).map((item: any) => ({
        key: item.id,
        productId: item.productId,
        supplierId: item.supplierId ?? order.supplierId,
        factoryId: item.factoryId ?? order.factoryId ?? '',
        quantity: String(item.quantity),
        purchasePriceYuan: String(item.purchasePriceYuan),
        yuanRate: String(item.yuanRate),
        weightKg: String(item.weightKg),
        note: item.note ?? '',
      })));
    }).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  const totals = useMemo(() => calculateLandedCosts(
    lines.map((line) => ({ quantity: Number(line.quantity || 0), purchasePriceYuan: Number(line.purchasePriceYuan || 0), yuanRate: Number(line.yuanRate || form.defaultYuanRate || 0), weightKg: Number(line.weightKg || 0) })),
    {
      chinaDomesticTransportKgs: Number(form.chinaDomesticTransportKgs || 0), chinaExportTransportKgs: Number(form.chinaExportTransportKgs || 0),
      localTransportKgs: Number(form.localTransportKgs || 0), packagingCostKgs: Number(form.packagingCostKgs || 0),
      customsCostKgs: Number(form.customsCostKgs || 0), insuranceCostKgs: Number(form.insuranceCostKgs || 0),
      bankFeeCostKgs: Number(form.bankFeeCostKgs || 0), otherExpenseKgs: Number(form.otherExpenseKgs || 0),
    },
  ), [form, lines]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          defaultYuanRate: Number(form.defaultYuanRate || 0),
          chinaDomesticTransportKgs: Number(form.chinaDomesticTransportKgs || 0),
          chinaExportTransportKgs: Number(form.chinaExportTransportKgs || 0),
          localTransportKgs: Number(form.localTransportKgs || 0),
          packagingCostKgs: Number(form.packagingCostKgs || 0),
          customsCostKgs: Number(form.customsCostKgs || 0),
          insuranceCostKgs: Number(form.insuranceCostKgs || 0),
          bankFeeCostKgs: Number(form.bankFeeCostKgs || 0),
          otherExpenseKgs: Number(form.otherExpenseKgs || 0),
          items: lines.map((line) => ({
            productId: line.productId,
            supplierId: line.supplierId || form.supplierId,
            factoryId: line.factoryId || form.factoryId || undefined,
            quantity: Number(line.quantity || 0),
            purchasePriceYuan: Number(line.purchasePriceYuan || 0),
            yuanRate: Number(line.yuanRate || form.defaultYuanRate || 0),
            weightKg: Number(line.weightKg || 0),
            note: line.note || undefined,
          })),
        }),
      });
      window.localStorage.setItem('emotors_procurement_success', t('procurement.orders.updated'));
      router.push(`/procurement/orders/${id}`);
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
          <Link href={`/procurement/orders/${id}`} className="text-sm font-semibold text-blue-700">{t('procurement.orders.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.orders.edit')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.supplier')}</span><select value={form.supplierId} onChange={(e) => setForm((c) => ({ ...c, supplierId: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.warehouse')}</span><select value={form.hqWarehouseId} onChange={(e) => setForm((c) => ({ ...c, hqWarehouseId: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.chinaDomestic')}</span><input type="number" value={form.chinaDomesticTransportKgs} onChange={(e) => setForm((c) => ({ ...c, chinaDomesticTransportKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.chinaExport')}</span><input type="number" value={form.chinaExportTransportKgs} onChange={(e) => setForm((c) => ({ ...c, chinaExportTransportKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.localTransport')}</span><input type="number" value={form.localTransportKgs} onChange={(e) => setForm((c) => ({ ...c, localTransportKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.packaging')}</span><input type="number" value={form.packagingCostKgs} onChange={(e) => setForm((c) => ({ ...c, packagingCostKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.customs')}</span><input type="number" value={form.customsCostKgs} onChange={(e) => setForm((c) => ({ ...c, customsCostKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.insurance')}</span><input type="number" value={form.insuranceCostKgs} onChange={(e) => setForm((c) => ({ ...c, insuranceCostKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.bankFees')}</span><input type="number" value={form.bankFeeCostKgs} onChange={(e) => setForm((c) => ({ ...c, bankFeeCostKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.otherExpenses')}</span><input type="number" value={form.otherExpenseKgs} onChange={(e) => setForm((c) => ({ ...c, otherExpenseKgs: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
        </section>
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('procurement.orders.products')}</h3>
          {lines.map((line, index) => (
            <div key={line.key} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-4">
              <label className="block md:col-span-2"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.product')}</span><select value={line.productId} onChange={(e) => setLines((current) => current.map((row) => row.key === line.key ? { ...row, productId: e.target.value } : row))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label>
              <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.quantity')}</span><input type="number" value={line.quantity} onChange={(e) => setLines((current) => current.map((row) => row.key === line.key ? { ...row, quantity: e.target.value } : row))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.purchasePriceYuan')}</span><input type="number" value={line.purchasePriceYuan} onChange={(e) => setLines((current) => current.map((row) => row.key === line.key ? { ...row, purchasePriceYuan: e.target.value } : row))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block"><span className="text-sm font-semibold text-slate-700">{t('inventory.weightKg')}</span><input type="number" value={line.weightKg} onChange={(e) => setLines((current) => current.map((row) => row.key === line.key ? { ...row, weightKg: e.target.value } : row))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block"><span className="text-sm font-semibold text-slate-700">{t('inventory.finalCostKgs')}</span><input disabled value={`${Number(totals.items[index]?.finalCostKgs ?? 0).toFixed(2)} сом`} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2" /></label>
            </div>
          ))}
        </section>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">{t('procurement.orders.totalWeightKg')}: {totals.totalWeightKg} kg · {t('procurement.orders.costPerKg')}: {Number(totals.costPerKg).toFixed(2)} · {t('procurement.orders.totalCostKgs')}: {Number(totals.totalCostKgs).toFixed(2)} сом</p>
          <button disabled={saving} type="submit" className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300">{saving ? t('common.loading') : t('procurement.orders.save')}</button>
        </div>
      </form>
    </ProtectedShell>
  );
}
