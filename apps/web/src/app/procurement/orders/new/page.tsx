'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { calculateLandedCosts } from '@/lib/landed-cost';
import type { Product, ProductListResponse, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = { id: string; name: string };
type Factory = { id: string; name: string; supplierId: string };

type OrderLine = {
  key: string;
  productId: string;
  supplierId: string;
  factoryId: string;
  quantity: string;
  purchasePriceYuan: string;
  yuanRate: string;
  weightKg: string;
  note: string;
};

const emptyLine = (): OrderLine => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: '',
  supplierId: '',
  factoryId: '',
  quantity: '1',
  purchasePriceYuan: '0',
  yuanRate: '0',
  weightKg: '0',
  note: '',
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
    defaultYuanRate: '0',
    estimatedArrivalDate: '',
    note: '',
    chinaDomesticTransportKgs: '0',
    chinaExportTransportKgs: '0',
    localTransportKgs: '0',
    packagingCostKgs: '0',
    customsCostKgs: '0',
    insuranceCostKgs: '0',
    bankFeeCostKgs: '0',
    otherExpenseKgs: '0',
  });
  const [lines, setLines] = useState<OrderLine[]>([emptyLine()]);

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
        const firstProduct = productResult.items[0];
        setForm((current) => ({
          ...current,
          supplierId: supplierResult[0]?.id ?? '',
          factoryId: factoryResult[0]?.id ?? '',
          hqWarehouseId: warehouseResult[0]?.id ?? '',
          defaultYuanRate: String(firstProduct?.latestYuanRate ?? 0),
        }));
        setLines([{
          ...emptyLine(),
          productId: firstProduct?.id ?? '',
          supplierId: supplierResult[0]?.id ?? '',
          factoryId: factoryResult[0]?.id ?? '',
          purchasePriceYuan: String(firstProduct?.purchasePriceYuan ?? 0),
          yuanRate: String(firstProduct?.latestYuanRate ?? 0),
          weightKg: String(firstProduct?.weightKg ?? 0),
        }]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const totals = useMemo(() => {
    const logistics = {
      chinaDomesticTransportKgs: Number(form.chinaDomesticTransportKgs || 0),
      chinaExportTransportKgs: Number(form.chinaExportTransportKgs || 0),
      localTransportKgs: Number(form.localTransportKgs || 0),
      packagingCostKgs: Number(form.packagingCostKgs || 0),
      customsCostKgs: Number(form.customsCostKgs || 0),
      insuranceCostKgs: Number(form.insuranceCostKgs || 0),
      bankFeeCostKgs: Number(form.bankFeeCostKgs || 0),
      otherExpenseKgs: Number(form.otherExpenseKgs || 0),
    };
    return calculateLandedCosts(
      lines.map((line) => ({
        quantity: Number(line.quantity || 0),
        purchasePriceYuan: Number(line.purchasePriceYuan || 0),
        yuanRate: Number(line.yuanRate || form.defaultYuanRate || 0),
        weightKg: Number(line.weightKg || 0),
      })),
      logistics,
    );
  }, [form, lines]);

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLine(key: string, patch: Partial<OrderLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const product = products[0];
    setLines((current) => [...current, {
      ...emptyLine(),
      productId: product?.id ?? '',
      supplierId: form.supplierId,
      factoryId: form.factoryId,
      purchasePriceYuan: String(product?.purchasePriceYuan ?? 0),
      yuanRate: String(product?.latestYuanRate ?? form.defaultYuanRate ?? 0),
      weightKg: String(product?.weightKg ?? 0),
    }]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/procurement/orders', {
        method: 'POST',
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
        <div>
          <Link href="/procurement/orders" className="text-sm font-semibold text-blue-700">{t('procurement.orders.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('procurement.orders.new')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
              <h3 className="md:col-span-2 text-lg font-bold text-slate-950">{t('procurement.orders.generalInfo')}</h3>
              <Select label={t('procurement.orders.supplier')} value={form.supplierId} onChange={(value) => setField('supplierId', value)} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <Select label={t('procurement.orders.factory')} value={form.factoryId} onChange={(value) => setField('factoryId', value)} options={[{ value: '', label: '-' }, ...factories.map((f) => ({ value: f.id, label: f.name }))]} />
              <Select label={t('procurement.orders.warehouse')} value={form.hqWarehouseId} onChange={(value) => setField('hqWarehouseId', value)} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
              <Input label={t('procurement.orders.yuanRate')} type="number" value={form.defaultYuanRate} onChange={(value) => setField('defaultYuanRate', value)} />
              <Input label={t('procurement.orders.estimatedArrivalDate')} type="date" value={form.estimatedArrivalDate} onChange={(value) => setField('estimatedArrivalDate', value)} />
              <label className="block md:col-span-2"><span className="text-sm font-semibold text-slate-700">{t('procurement.orders.note')}</span><textarea value={form.note} onChange={(e) => setField('note', e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-950">{t('procurement.orders.products')}</h3>
                <button type="button" onClick={addLine} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700">{t('procurement.orders.addProduct')}</button>
              </div>
              <div className="space-y-4">
                {lines.map((line, index) => (
                  <div key={line.key} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-semibold text-slate-800">{t('procurement.orders.product')} #{index + 1}</p>
                      {lines.length > 1 ? <button type="button" onClick={() => removeLine(line.key)} className="text-sm font-semibold text-red-600">{t('common.delete')}</button> : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Select label={t('procurement.orders.product')} value={line.productId} onChange={(value) => {
                        const product = products.find((p) => p.id === value);
                        updateLine(line.key, {
                          productId: value,
                          purchasePriceYuan: product ? String(product.purchasePriceYuan ?? 0) : line.purchasePriceYuan,
                          yuanRate: product ? String(product.latestYuanRate ?? 0) : line.yuanRate,
                          weightKg: product ? String(product.weightKg ?? 0) : line.weightKg,
                        });
                      }} options={products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }))} />
                      <Select label={t('procurement.orders.supplier')} value={line.supplierId || form.supplierId} onChange={(value) => updateLine(line.key, { supplierId: value })} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                      <Select label={t('procurement.orders.factory')} value={line.factoryId || form.factoryId} onChange={(value) => updateLine(line.key, { factoryId: value })} options={[{ value: '', label: '-' }, ...factories.filter((f) => !line.supplierId || f.supplierId === line.supplierId || f.supplierId === form.supplierId).map((f) => ({ value: f.id, label: f.name }))]} />
                      <Input label={t('procurement.orders.quantity')} type="number" value={line.quantity} onChange={(value) => updateLine(line.key, { quantity: value })} />
                      <Input label={t('procurement.orders.purchasePriceYuan')} type="number" value={line.purchasePriceYuan} onChange={(value) => updateLine(line.key, { purchasePriceYuan: value })} />
                      <Input label={t('inventory.weightKg')} type="number" value={line.weightKg} onChange={(value) => updateLine(line.key, { weightKg: value })} />
                      <Input label={t('procurement.orders.yuanRate')} type="number" value={line.yuanRate} onChange={(value) => updateLine(line.key, { yuanRate: value })} />
                      <Input label={t('inventory.finalCostKgs')} type="text" value={formatKgs(totals.items[index]?.finalCostKgs ?? 0)} onChange={() => undefined} disabled />
                      <Input label={t('procurement.orders.totalWeightKg')} type="text" value={`${totals.items[index]?.totalWeightKg ?? 0} kg`} onChange={() => undefined} disabled />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
              <h3 className="md:col-span-2 text-lg font-bold text-slate-950">{t('procurement.orders.transportCosts')}</h3>
              <Input label={t('procurement.orders.chinaDomestic')} type="number" value={form.chinaDomesticTransportKgs} onChange={(value) => setField('chinaDomesticTransportKgs', value)} />
              <Input label={t('procurement.orders.chinaExport')} type="number" value={form.chinaExportTransportKgs} onChange={(value) => setField('chinaExportTransportKgs', value)} />
              <Input label={t('procurement.orders.localTransport')} type="number" value={form.localTransportKgs} onChange={(value) => setField('localTransportKgs', value)} />
              <Input label={t('procurement.orders.packaging')} type="number" value={form.packagingCostKgs} onChange={(value) => setField('packagingCostKgs', value)} />
              <Input label={t('procurement.orders.customs')} type="number" value={form.customsCostKgs} onChange={(value) => setField('customsCostKgs', value)} />
              <Input label={t('procurement.orders.insurance')} type="number" value={form.insuranceCostKgs} onChange={(value) => setField('insuranceCostKgs', value)} />
              <Input label={t('procurement.orders.bankFees')} type="number" value={form.bankFeeCostKgs} onChange={(value) => setField('bankFeeCostKgs', value)} />
              <Input label={t('procurement.orders.otherExpenses')} type="number" value={form.otherExpenseKgs} onChange={(value) => setField('otherExpenseKgs', value)} />
            </section>
          </div>

          <aside className="h-fit space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">{t('procurement.orders.weightSummary')}</h3>
              <Preview label={t('procurement.orders.totalWeightKg')} value={`${totals.totalWeightKg} kg`} />
              <Preview label={t('procurement.orders.costPerKg')} value={formatKgs(totals.costPerKg)} />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">{t('procurement.orders.landedCostSummary')}</h3>
              <Preview label={t('procurement.orders.totalYuan')} value={`¥${totals.totalYuan.toFixed(2)}`} />
              <Preview label={t('procurement.orders.totalTransportKgs')} value={formatKgs(totals.totalTransportCostKgs)} />
              <Preview label={t('procurement.orders.totalCostKgs')} value={formatKgs(totals.totalCostKgs)} />
              <button disabled={saving} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300" type="submit">{saving ? t('common.loading') : t('procurement.orders.save')}</button>
            </div>
          </aside>
        </div>
      </form>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>;
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
