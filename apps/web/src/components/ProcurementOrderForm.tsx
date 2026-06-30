'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { calculateLandedCosts } from '@/lib/landed-cost';
import type { Product, ProductListResponse, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = { id: string; name: string };
type Factory = { id: string; name: string; supplierId: string };

export type ProcurementLine = {
  key: string;
  productId: string;
  factoryId: string;
  quantity: string;
  purchasePriceYuan: string;
};

type HeaderForm = {
  supplierId: string;
  factoryId: string;
  hqWarehouseId: string;
  currency: string;
  exchangeRate: string;
  purchaseDate: string;
  estimatedArrivalDate: string;
  note: string;
  chinaDomesticTransportKgs: string;
  chinaExportTransportKgs: string;
  localTransportKgs: string;
  packagingCostKgs: string;
  customsCostKgs: string;
  insuranceCostKgs: string;
  bankFeeCostKgs: string;
  otherExpenseKgs: string;
};

const emptyLine = (): ProcurementLine => ({
  key: `${Date.now()}-${Math.random()}`,
  productId: '',
  factoryId: '',
  quantity: '1',
  purchasePriceYuan: '0',
});

type Props = {
  mode: 'create' | 'edit';
  orderId?: string;
  backHref: string;
  title: string;
};

export function ProcurementOrderForm({ mode, orderId, backHref, title }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [form, setForm] = useState<HeaderForm>({
    supplierId: '',
    factoryId: '',
    hqWarehouseId: '',
    currency: 'CNY',
    exchangeRate: '0',
    purchaseDate: new Date().toISOString().slice(0, 10),
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
  const [lines, setLines] = useState<ProcurementLine[]>([emptyLine()]);

  useEffect(() => {
    const loaders: Promise<unknown>[] = [
      apiFetch<Supplier[]>('/procurement/suppliers'),
      apiFetch<Factory[]>('/procurement/factories'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=500'),
    ];
    if (mode === 'edit' && orderId) loaders.push(apiFetch<any>(`/procurement/orders/${orderId}`));

    Promise.all(loaders)
      .then((results) => {
        const [supplierResult, factoryResult, warehouseResult, productResult, order] = results as [
          Supplier[],
          Factory[],
          Warehouse[],
          ProductListResponse,
          any?,
        ];
        setSuppliers(supplierResult);
        setFactories(factoryResult);
        setWarehouses(warehouseResult);
        setProducts(productResult.items);

        if (mode === 'edit' && order) {
          setForm({
            supplierId: order.supplierId,
            factoryId: order.factoryId ?? '',
            hqWarehouseId: order.hqWarehouseId,
            currency: order.currency ?? 'CNY',
            exchangeRate: String(order.defaultYuanRate ?? 0),
            purchaseDate: order.purchaseDate ? order.purchaseDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
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
            factoryId: item.factoryId ?? order.factoryId ?? '',
            quantity: String(item.quantity),
            purchasePriceYuan: String(item.purchasePriceYuan),
          })));
        } else {
          const firstProduct = productResult.items[0];
          setForm((current) => ({
            ...current,
            supplierId: supplierResult[0]?.id ?? '',
            factoryId: factoryResult[0]?.id ?? '',
            hqWarehouseId: warehouseResult[0]?.id ?? '',
            exchangeRate: String(firstProduct?.latestYuanRate ?? 0),
          }));
          if (firstProduct) {
            setLines([{
              ...emptyLine(),
              productId: firstProduct.id,
              factoryId: factoryResult[0]?.id ?? '',
              purchasePriceYuan: String(firstProduct.purchasePriceYuan ?? 0),
            }]);
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [mode, orderId, t]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const factoryMap = useMemo(() => new Map(factories.map((f) => [f.id, f.name])), [factories]);

  const lineDetails = useMemo(() => lines.map((line) => {
    const product = productMap.get(line.productId);
    const weightKg = Number(product?.weightKg ?? 0);
    const quantity = Number(line.quantity || 0);
    const purchasePriceYuan = Number(line.purchasePriceYuan || 0);
    const exchangeRate = Number(form.exchangeRate || 0);
    const missingWeight = !product || weightKg <= 0;
    return {
      ...line,
      product,
      sku: product?.sku ?? '-',
      productName: product?.name ?? '-',
      unit: (product as Product & { unit?: string })?.unit ?? 'pcs',
      weightKg,
      totalWeightKg: quantity * weightKg,
      totalYuan: quantity * purchasePriceYuan,
      totalCostKgs: quantity * purchasePriceYuan * exchangeRate,
      missingWeight,
      factoryName: factoryMap.get(line.factoryId || form.factoryId) ?? '-',
    };
  }), [lines, productMap, factoryMap, form.exchangeRate, form.factoryId]);

  const totals = useMemo(() => calculateLandedCosts(
    lineDetails.map((line) => ({
      quantity: Number(line.quantity || 0),
      purchasePriceYuan: Number(line.purchasePriceYuan || 0),
      yuanRate: Number(form.exchangeRate || 0),
      weightKg: line.weightKg,
    })),
    {
      chinaDomesticTransportKgs: Number(form.chinaDomesticTransportKgs || 0),
      chinaExportTransportKgs: Number(form.chinaExportTransportKgs || 0),
      localTransportKgs: Number(form.localTransportKgs || 0),
      packagingCostKgs: Number(form.packagingCostKgs || 0),
      customsCostKgs: Number(form.customsCostKgs || 0),
      insuranceCostKgs: Number(form.insuranceCostKgs || 0),
      bankFeeCostKgs: Number(form.bankFeeCostKgs || 0),
      otherExpenseKgs: Number(form.otherExpenseKgs || 0),
    },
  ), [form, lineDetails]);

  const weightErrors = lineDetails.filter((line) => line.productId && line.missingWeight);
  const totalQuantity = lineDetails.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  function setField<K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLine(key: string, patch: Partial<ProcurementLine>) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const next = { ...line, ...patch };
      if (patch.productId) {
        const product = productMap.get(patch.productId);
        next.purchasePriceYuan = product ? String(product.purchasePriceYuan ?? 0) : line.purchasePriceYuan;
        const defaultFactory = (product as Product & { defaultFactoryId?: string })?.defaultFactoryId;
        if (defaultFactory) next.factoryId = defaultFactory;
      }
      return next;
    }));
  }

  function addLine() {
    const product = products[0];
    setLines((current) => [...current, {
      ...emptyLine(),
      productId: product?.id ?? '',
      factoryId: form.factoryId,
      purchasePriceYuan: String(product?.purchasePriceYuan ?? 0),
    }]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!Number(form.exchangeRate || 0)) {
      setError(t('procurement.orders.exchangeRateRequired'));
      return;
    }
    if (weightErrors.length) {
      setError(t('procurement.orders.weightNotConfigured'));
      return;
    }
    setSaving(true);
    const payload = {
      supplierId: form.supplierId,
      factoryId: form.factoryId || undefined,
      hqWarehouseId: form.hqWarehouseId,
      currency: form.currency,
      defaultYuanRate: Number(form.exchangeRate),
      purchaseDate: form.purchaseDate || undefined,
      estimatedArrivalDate: form.estimatedArrivalDate || undefined,
      note: form.note || undefined,
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
        factoryId: line.factoryId || form.factoryId || undefined,
        quantity: Number(line.quantity || 0),
        purchasePriceYuan: Number(line.purchasePriceYuan || 0),
      })),
    };
    try {
      if (mode === 'edit' && orderId) {
        await apiFetch(`/procurement/orders/${orderId}`, { method: 'PUT', body: JSON.stringify(payload) });
        window.localStorage.setItem('emotors_procurement_success', t('procurement.orders.updated'));
        router.push(`/procurement/orders/${orderId}`);
      } else {
        await apiFetch('/procurement/orders', { method: 'POST', body: JSON.stringify(payload) });
        window.localStorage.setItem('emotors_procurement_success', t('procurement.orders.created'));
        router.push('/procurement/orders');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm font-semibold text-blue-700">{t('procurement.orders.title')}</Link>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">{title}</h2>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {weightErrors.length ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.orders.weightNotConfigured')}</p>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-950">{t('procurement.orders.shipmentInfo')}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('procurement.orders.supplier')}><select value={form.supplierId} onChange={(e) => setField('supplierId', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label={t('procurement.orders.currency')}><input value={form.currency} readOnly className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.exchangeRate')}><input type="number" step="0.0001" value={form.exchangeRate} onChange={(e) => setField('exchangeRate', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.purchaseDate')}><input type="date" value={form.purchaseDate} onChange={(e) => setField('purchaseDate', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.estimatedArrivalDate')}><input type="date" value={form.estimatedArrivalDate} onChange={(e) => setField('estimatedArrivalDate', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.warehouse')}><select value={form.hqWarehouseId} onChange={(e) => setField('hqWarehouseId', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Field label={t('procurement.orders.chinaDomestic')}><input type="number" value={form.chinaDomesticTransportKgs} onChange={(e) => setField('chinaDomesticTransportKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.chinaExport')}><input type="number" value={form.chinaExportTransportKgs} onChange={(e) => setField('chinaExportTransportKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.localTransport')}><input type="number" value={form.localTransportKgs} onChange={(e) => setField('localTransportKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.packaging')}><input type="number" value={form.packagingCostKgs} onChange={(e) => setField('packagingCostKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.customs')}><input type="number" value={form.customsCostKgs} onChange={(e) => setField('customsCostKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.insurance')}><input type="number" value={form.insuranceCostKgs} onChange={(e) => setField('insuranceCostKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.bankFees')}><input type="number" value={form.bankFeeCostKgs} onChange={(e) => setField('bankFeeCostKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.otherExpenses')}><input type="number" value={form.otherExpenseKgs} onChange={(e) => setField('otherExpenseKgs', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-950">{t('procurement.orders.productsTable')}</h3>
          <button type="button" onClick={addLine} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700">{t('procurement.orders.addProduct')}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">{t('procurement.orders.product')}</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">{t('procurement.orders.factory')}</th>
                <th className="px-3 py-3">{t('procurement.orders.quantity')}</th>
                <th className="px-3 py-3">{t('procurement.orders.unit')}</th>
                <th className="px-3 py-3">{t('procurement.orders.weightPerUnit')}</th>
                <th className="px-3 py-3">{t('procurement.orders.totalWeightKg')}</th>
                <th className="px-3 py-3">{t('procurement.orders.purchasePriceYuan')}</th>
                <th className="px-3 py-3">{t('procurement.orders.totalYuan')}</th>
                <th className="px-3 py-3">{t('procurement.orders.totalCostKgs')}</th>
                <th className="px-3 py-3">{t('inventory.finalCostKgs')}</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineDetails.map((line, index) => (
                <tr key={line.key} className={line.missingWeight ? 'bg-amber-50' : ''}>
                  <td className="px-3 py-3 min-w-48">
                    <select value={line.productId} onChange={(e) => updateLine(line.key, { productId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{line.sku}</td>
                  <td className="px-3 py-3">{line.factoryName}</td>
                  <td className="px-3 py-3"><input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5" /></td>
                  <td className="px-3 py-3">{line.unit}</td>
                  <td className="px-3 py-3">{line.missingWeight ? <span className="text-amber-700">{t('procurement.orders.missing')}</span> : `${line.weightKg.toFixed(3)} kg`}</td>
                  <td className="px-3 py-3">{line.totalWeightKg.toFixed(3)}</td>
                  <td className="px-3 py-3"><input type="number" min={0} step="0.01" value={line.purchasePriceYuan} onChange={(e) => updateLine(line.key, { purchasePriceYuan: e.target.value })} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5" /></td>
                  <td className="px-3 py-3">¥{line.totalYuan.toFixed(2)}</td>
                  <td className="px-3 py-3">{formatKgs(totals.items[index]?.totalCostKgs ?? line.totalCostKgs)}</td>
                  <td className="px-3 py-3 font-semibold">{formatKgs(totals.items[index]?.finalCostKgs ?? 0)}</td>
                  <td className="px-3 py-3">{lines.length > 1 ? <button type="button" onClick={() => removeLine(line.key)} className="text-red-600">{t('common.delete')}</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label={t('procurement.orders.totalProducts')} value={String(lines.length)} />
        <SummaryCard label={t('procurement.orders.totalQuantity')} value={String(totalQuantity)} />
        <SummaryCard label={t('procurement.orders.shipmentWeight')} value={`${totals.totalWeightKg} kg`} />
        <SummaryCard label={t('procurement.orders.totalYuan')} value={`¥${totals.totalYuan.toFixed(2)}`} />
        <SummaryCard label={t('procurement.orders.totalKgs')} value={formatKgs(totals.items.reduce((s, i) => s + i.costKgs * i.effectiveQuantity, 0))} />
        <SummaryCard label={t('procurement.orders.estimatedLandedCost')} value={formatKgs(totals.totalCostKgs)} />
      </section>

      <div className="flex justify-end">
        <button disabled={saving || weightErrors.length > 0} type="submit" className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:bg-blue-300">
          {saving ? t('common.loading') : t('procurement.orders.save')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><div className="mt-2">{children}</div></label>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="mt-2 text-xl font-bold text-slate-950">{value}</p></div>;
}

function formatKgs(value: number) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
