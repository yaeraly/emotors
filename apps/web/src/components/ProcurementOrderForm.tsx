'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { calculateLandedCosts } from '@/lib/landed-cost';
import { resolveChinaDomesticTransportKgs } from '@/lib/transport-logistics';
import { ProcurementProductSearch } from '@/components/ProcurementProductSearch';
import { canEditChinaDomesticTransport } from '@/lib/china-domestic-transport-lock';
import { consumePurchaseAssistantDraft } from '@/lib/purchase-assistant-draft';
import { canEditProcurementOrderItemsInWindow } from '@/lib/rbac';
import type { Product, User, Warehouse } from '@/lib/types';
import { ProcurementEditWindowPanel } from '@/components/ProcurementEditWindowPanel';
import { formatProductUnit } from '@/lib/product-unit';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type Supplier = { id: string; name: string };
type Factory = { id: string; name: string; supplierId: string };

export type ProcurementLine = {
  key: string;
  productId: string;
  factoryId: string;
  quantity: string;
  purchasePriceYuan: string;
  masterPriceYuan: string;
};

type HeaderForm = {
  supplierId: string;
  factoryId: string;
  hqWarehouseId: string;
  currency: string;
  purchaseDate: string;
  estimatedArrivalDate: string;
  note: string;
  chinaDomesticTransportYuan: string;
  chinaDomesticTransportCompanyId: string;
  chinaExportTransportCompanyId: string;
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
  masterPriceYuan: '0',
});

type Props = {
  mode: 'create' | 'edit';
  orderId?: string;
  backHref: string;
  title: string;
};

export function ProcurementOrderForm({ mode, orderId, backHref, title }: Props) {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [form, setForm] = useState<HeaderForm>({
    supplierId: '',
    factoryId: '',
    hqWarehouseId: '',
    currency: 'CNY',
    purchaseDate: new Date().toISOString().slice(0, 10),
    estimatedArrivalDate: '',
    note: '',
    chinaDomesticTransportYuan: '0',
    chinaDomesticTransportCompanyId: '',
    chinaExportTransportCompanyId: '',
    customsCostKgs: '0',
    insuranceCostKgs: '0',
    bankFeeCostKgs: '0',
    otherExpenseKgs: '0',
  });
  const [lines, setLines] = useState<ProcurementLine[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [editWindow, setEditWindow] = useState<{
    isEditable?: boolean;
    editWindowStatus?: string;
    sentToSupplierAt?: string | null;
    editableUntil?: string | null;
    secondsRemaining?: number | null;
    unlockExpiresAt?: string | null;
    unlockReason?: string | null;
    unlockedBy?: { fullName?: string } | null;
  }>({});
  const [chinaDomesticTransportEditable, setChinaDomesticTransportEditable] = useState(true);

  useEffect(() => {
    const loaders: Promise<unknown>[] = [
      apiFetch<Supplier[]>('/procurement/suppliers'),
      apiFetch<Factory[]>('/procurement/factories'),
      apiFetch<Warehouse[]>('/inventory/warehouses?warehouseType=HQ&status=ACTIVE'),
      apiFetch<User>('/auth/me'),
    ];
    if (mode === 'edit' && orderId) loaders.push(apiFetch<any>(`/procurement/orders/${orderId}`));

    Promise.all(loaders)
      .then((results) => {
        const supplierResult = results[0] as Supplier[];
        const factoryResult = results[1] as Factory[];
        const warehouseResult = results[2] as Warehouse[];
        const me = results[3] as User;
        const order = mode === 'edit' && orderId ? results[4] as any : undefined;
        setUser(me);
        setSuppliers(supplierResult);
        setFactories(factoryResult);
        setWarehouses(warehouseResult);

        if (mode === 'edit' && order) {
          const cachedProducts = (order.items ?? [])
            .map((item: any) => item.product)
            .filter(Boolean) as Product[];
          setProducts(cachedProducts);
          setChinaDomesticTransportEditable(
            order.chinaDomesticTransportEditable ?? canEditChinaDomesticTransport(order),
          );
          setEditWindow({
            isEditable: order.isEditable,
            editWindowStatus: order.editWindowStatus,
            sentToSupplierAt: order.sentToSupplierAt,
            editableUntil: order.editableUntil,
            secondsRemaining: order.secondsRemaining,
            unlockExpiresAt: order.unlockExpiresAt,
            unlockReason: order.unlockReason,
            unlockedBy: order.unlockedBy,
          });
          setForm({
            supplierId: order.supplierId,
            factoryId: order.factoryId ?? '',
            hqWarehouseId: order.hqWarehouseId,
            currency: order.currency ?? 'CNY',
            purchaseDate: order.purchaseDate ? order.purchaseDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
            estimatedArrivalDate: order.estimatedArrivalDate ? order.estimatedArrivalDate.slice(0, 10) : '',
            note: order.note ?? '',
            chinaDomesticTransportYuan: String(order.chinaDomesticTransportYuan ?? 0),
            chinaDomesticTransportCompanyId: order.chinaDomesticTransportCompanyId ?? '',
            chinaExportTransportCompanyId: order.chinaExportTransportCompanyId ?? '',
            customsCostKgs: String(order.customsCostKgs ?? 0),
            insuranceCostKgs: String(order.insuranceCostKgs ?? 0),
            bankFeeCostKgs: String(order.bankFeeCostKgs ?? 0),
            otherExpenseKgs: String(order.otherExpenseKgs ?? 0),
          });
          setLines((order.items ?? [])
            .filter((item: any) => item.status !== 'CANCELLED')
            .map((item: any) => {
            const product = item.product as Product | undefined;
            const masterPrice = String(product?.purchasePriceYuan ?? item.purchasePriceYuan ?? 0);
            return {
              key: item.id,
              productId: item.productId,
              factoryId: item.factoryId ?? order.factoryId ?? '',
              quantity: String(item.quantity),
              purchasePriceYuan: String(item.purchasePriceYuan),
              masterPriceYuan: masterPrice,
            };
          }));
        } else {
          setForm((current) => ({
            ...current,
            supplierId: supplierResult[0]?.id ?? '',
            factoryId: factoryResult[0]?.id ?? '',
            hqWarehouseId: warehouseResult[0]?.id ?? '',
          }));
          const draft = consumePurchaseAssistantDraft();
          if (draft?.items?.length) {
            const draftProducts = draft.items.map((item) => ({
              id: item.productId,
              name: item.name ?? item.sku ?? item.productId,
              sku: item.sku ?? '',
              purchasePriceYuan: item.purchasePriceYuan ?? 0,
              defaultFactoryId: item.factoryId ?? undefined,
            })) as Product[];
            setProducts(draftProducts);
            setLines(
              draft.items.map((item) => ({
                ...emptyLine(),
                productId: item.productId,
                factoryId: item.factoryId || factoryResult[0]?.id || '',
                quantity: String(Math.max(1, Number(item.quantity) || 1)),
                purchasePriceYuan: String(item.purchasePriceYuan ?? 0),
                masterPriceYuan: String(item.purchasePriceYuan ?? 0),
              })),
            );
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
    const netWeightKg = Number(product?.weightKg ?? 0);
    const quantity = Number(line.quantity || 0);
    const purchasePriceYuan = Number(line.purchasePriceYuan || 0);
    const masterPriceYuan = Number(line.masterPriceYuan || product?.purchasePriceYuan || 0);
    const priceDifference = purchasePriceYuan - masterPriceYuan;
    const missingWeight = !product || netWeightKg <= 0;
    return {
      ...line,
      product,
      sku: product?.sku ?? '-',
      productName: product?.name ?? '-',
      netWeightKg,
      totalNetWeightKg: quantity * netWeightKg,
      totalYuan: quantity * purchasePriceYuan,
      masterPriceYuan,
      priceDifference,
      priceChanged: priceDifference !== 0,
      missingWeight,
      factoryName: factoryMap.get(line.factoryId || form.factoryId) ?? '-',
    };
  }), [lines, productMap, factoryMap, form.factoryId]);

  const chinaDomesticTransportKgs = useMemo(
    () => resolveChinaDomesticTransportKgs({
      chinaDomesticTransportYuan: mode === 'create' ? 0 : Number(form.chinaDomesticTransportYuan || 0),
      chinaDomesticTransportKgs: 0,
      effectiveYuanRate: 0,
    }),
    [form.chinaDomesticTransportYuan, mode],
  );

  const totals = useMemo(() => calculateLandedCosts(
    lineDetails.map((line) => ({
      quantity: Number(line.quantity || 0),
      purchasePriceYuan: Number(line.purchasePriceYuan || 0),
      yuanRate: 0,
      weightKg: line.netWeightKg,
    })),
    {
      chinaDomesticTransportKgs: mode === 'create' ? 0 : chinaDomesticTransportKgs,
      chinaExportTransportKgs: 0,
      localTransportKgs: 0,
      packagingCostKgs: 0,
      customsCostKgs: mode === 'create' ? 0 : Number(form.customsCostKgs || 0),
      insuranceCostKgs: mode === 'create' ? 0 : Number(form.insuranceCostKgs || 0),
      bankFeeCostKgs: mode === 'create' ? 0 : Number(form.bankFeeCostKgs || 0),
      otherExpenseKgs: Number(form.otherExpenseKgs || 0),
    },
  ), [form, lineDetails, chinaDomesticTransportKgs, mode]);

  const weightErrors = lineDetails.filter((line) => line.productId && line.missingWeight);
  const sentToSupplier = !!editWindow.sentToSupplierAt;
  const canEditItems = canEditProcurementOrderItemsInWindow(user, editWindow);
  const itemsLocked = mode === 'edit' && sentToSupplier && !canEditItems;

  function setField<K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLine(key: string, patch: Partial<ProcurementLine>) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const next = { ...line, ...patch };
      if (patch.productId) {
        const product = productMap.get(patch.productId);
        const masterPrice = product ? String(product.purchasePriceYuan ?? 0) : line.masterPriceYuan;
        next.purchasePriceYuan = masterPrice;
        next.masterPriceYuan = masterPrice;
        const defaultFactory = (product as Product & { defaultFactoryId?: string })?.defaultFactoryId;
        if (defaultFactory) next.factoryId = defaultFactory;
      }
      return next;
    }));
  }

  function cacheProduct(product: Product) {
    setProducts((current) => {
      if (current.some((entry) => entry.id === product.id)) {
        return current.map((entry) => (entry.id === product.id ? product : entry));
      }
      return [...current, product];
    });
  }

  function addProductFromSearch(product: Product) {
    cacheProduct(product);
    const masterPrice = String(product.purchasePriceYuan ?? 0);
    const defaultFactory = product.defaultFactoryId ?? form.factoryId;
    setLines((current) => {
      const existingIndex = current.findIndex((line) => line.productId === product.id);
      if (existingIndex >= 0) {
        const existing = current[existingIndex];
        const nextQty = Math.max(1, Number(existing.quantity || 0) + 1);
        const next = [...current];
        next[existingIndex] = {
          ...existing,
          quantity: String(nextQty),
          factoryId: existing.factoryId || defaultFactory,
        };
        return next;
      }
      return [
        ...current,
        {
          ...emptyLine(),
          productId: product.id,
          factoryId: defaultFactory,
          purchasePriceYuan: masterPrice,
          masterPriceYuan: masterPrice,
        },
      ];
    });
  }

  function focusProductSearch() {
    productSearchRef.current?.focus();
  }

  function addLine() {
    focusProductSearch();
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (weightErrors.length) {
      setError(t('procurement.orders.weightNotConfigured'));
      return;
    }
    if (!lines.length) {
      setError(t('procurement.orders.productSearch.emptyOrder'));
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      supplierId: form.supplierId,
      factoryId: form.factoryId || undefined,
      hqWarehouseId: form.hqWarehouseId,
      currency: form.currency,
      purchaseDate: form.purchaseDate || undefined,
      estimatedArrivalDate: form.estimatedArrivalDate || undefined,
      note: form.note || undefined,
      chinaExportTransportCompanyId: form.chinaExportTransportCompanyId || null,
      items: lines.map((line) => ({
        id: mode === 'edit' ? line.key : undefined,
        productId: line.productId,
        factoryId: line.factoryId || form.factoryId || undefined,
        quantity: Number(line.quantity || 0),
        purchasePriceYuan: Number(line.purchasePriceYuan || 0),
      })),
    };
    // Cost/logistics fields are entered later in the workflow (order detail), not on create.
    if (mode === 'edit') {
      payload.customsCostKgs = Number(form.customsCostKgs || 0);
      payload.insuranceCostKgs = Number(form.insuranceCostKgs || 0);
      payload.bankFeeCostKgs = Number(form.bankFeeCostKgs || 0);
      payload.otherExpenseKgs = Number(form.otherExpenseKgs || 0);
      if (chinaDomesticTransportEditable) {
        payload.chinaDomesticTransportYuan = Number(form.chinaDomesticTransportYuan || 0);
        payload.chinaDomesticTransportCompanyId = form.chinaDomesticTransportCompanyId || null;
      }
    }
    try {
      if (mode === 'edit' && orderId) {
        await apiFetch(`/procurement/orders/${orderId}`, { method: 'PUT', body: JSON.stringify(payload) });
        window.localStorage.setItem('emotors_procurement_success', t('procurement.orders.updated'));
        router.push(`/procurement/orders/${orderId}`);
      } else {
        const created = await apiFetch<{ id: string }>('/procurement/orders', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        // Payment details are configured later in Supply Manager → Платежи поставщику.
        window.localStorage.setItem('emotors_procurement_success', t('procurement.orders.created'));
        router.push(`/procurement/orders/${created.id}?tab=payments`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
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
      {mode === 'edit' && editWindow.sentToSupplierAt ? (
        <ProcurementEditWindowPanel
          sentToSupplierAt={editWindow.sentToSupplierAt}
          editableUntil={editWindow.editableUntil}
          unlockExpiresAt={editWindow.unlockExpiresAt}
          unlockReason={editWindow.unlockReason}
          unlockedBy={editWindow.unlockedBy}
          isEditable={editWindow.isEditable}
          editWindowStatus={editWindow.editWindowStatus as any}
          secondsRemaining={editWindow.secondsRemaining}
        />
      ) : null}
      {itemsLocked ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('procurement.orders.editWindow.expired')}</p> : null}
      {weightErrors.length ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('procurement.orders.weightNotConfigured')}</p>
      ) : null}
      <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{t('procurement.orders.landedCostEstimatedWarning')}</p>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-950">{t('procurement.orders.generalInfo')}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('procurement.orders.supplier')}><select disabled={itemsLocked} value={form.supplierId} onChange={(e) => setField('supplierId', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label={t('procurement.orders.factory')}><select disabled={itemsLocked} value={form.factoryId} onChange={(e) => setField('factoryId', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2"><option value="">-</option>{factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          <Field label={t('procurement.orders.warehouse')}><select value={form.hqWarehouseId} onChange={(e) => setField('hqWarehouseId', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          <Field label={t('procurement.orders.purchaseDate')}><input type="date" value={form.purchaseDate} onChange={(e) => setField('purchaseDate', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
          <Field label={t('procurement.orders.estimatedArrivalDate')}><input type="date" value={form.estimatedArrivalDate} onChange={(e) => setField('estimatedArrivalDate', e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></Field>
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('procurement.orders.exchangeRateOnPaymentHint')}</p>
        {mode === 'create' ? (
          <p className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {t('procurement.orders.paymentDetailsLaterHint')}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-950">{t('procurement.orders.productsTable')}</h3>
          <button type="button" disabled={itemsLocked} onClick={addLine} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50">{t('procurement.orders.addProduct')}</button>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <ProcurementProductSearch
            disabled={itemsLocked}
            inputRef={productSearchRef}
            onSelect={addProductFromSearch}
          />
        </div>

        {!lines.length ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            {t('procurement.orders.productSearch.emptyState')}
          </p>
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">{t('procurement.orders.product')}</th>
                <th className="px-3 py-3">{t('inventory.unit')}</th>
                <th className="px-3 py-3">{t('procurement.orders.quantity')}</th>
                <th className="px-3 py-3">{t('procurement.orders.lineTotalNetWeightKg')}</th>
                <th className="px-3 py-3">{t('procurement.orders.purchasePriceYuan')}</th>
                <th className="px-3 py-3">{t('procurement.orders.priceDifferenceYuan')}</th>
                <th className="px-3 py-3">{t('procurement.orders.totalYuan')}</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineDetails.map((line) => (
                <tr key={line.key} className={line.missingWeight ? 'bg-amber-50' : line.priceChanged ? 'bg-blue-50' : ''}>
                  <td className="px-3 py-3 min-w-48 font-semibold text-slate-900">{line.productName}</td>
                  <td className="px-3 py-3">{formatProductUnit(line.product?.unit, language, t)}</td>
                  <td className="px-3 py-3"><input disabled={itemsLocked} type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5" /></td>
                  <td className="px-3 py-3">{line.missingWeight ? <span className="text-amber-700">{t('procurement.orders.missing')}</span> : line.totalNetWeightKg.toFixed(3)}</td>
                  <td className="px-3 py-3">
                    <input
                      disabled={itemsLocked}
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.purchasePriceYuan}
                      onChange={(e) => updateLine(line.key, { purchasePriceYuan: e.target.value })}
                      className={`w-24 rounded-lg border px-2 py-1.5 ${line.priceChanged ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}
                    />
                  </td>
                  <td className="px-3 py-3 font-mono text-slate-800">{formatPriceDifferenceYuan(line.priceDifference)}</td>
                  <td className="px-3 py-3">¥{line.totalYuan.toFixed(2)}</td>
                  <td className="px-3 py-3"><button disabled={itemsLocked} type="button" onClick={() => removeLine(line.key)} className="text-red-600 disabled:opacity-50">{t('common.delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label={t('procurement.orders.totalNetWeightKg')} value={`${totals.totalNetWeightKg} kg`} />
        <SummaryCard label={t('procurement.orders.totalYuan')} value={`¥${totals.totalYuan.toFixed(2)}`} />
        <SummaryCard label={t('procurement.orders.estimatedLandedCost')} value={formatKgs(totals.totalCostKgs)} />
      </section>

      <div className="flex justify-end">
        <button disabled={saving || weightErrors.length > 0 || itemsLocked || lines.length === 0} type="submit" className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:bg-blue-300">
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

function formatPriceDifferenceYuan(value: number) {
  if (value === 0) return '0.00 ¥';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} ¥`;
}
