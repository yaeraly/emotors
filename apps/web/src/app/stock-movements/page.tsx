'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canCreateStockMovement } from '@/lib/rbac';
import type { Product, ProductListResponse, StockMovement, StockMovementType, User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const movementTypes: StockMovementType[] = [
  'IN',
  'OUT',
  'TRANSFER',
  'ADJUSTMENT',
  'SALE',
  'SERVICE_USE',
  'INVENTORY_ADJUSTMENT_IN',
  'INVENTORY_ADJUSTMENT_OUT',
];

export default function StockMovementsPage() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    productId: '',
    warehouseId: '',
    type: 'IN' as StockMovementType,
    quantity: '1',
    unitCostKgs: '',
    note: '',
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [productResult, warehouseResult, movementResult, currentUserResult] = await Promise.all([
        apiFetch<ProductListResponse>('/inventory/products?pageSize=200'),
        apiFetch<Warehouse[]>('/inventory/warehouses'),
        apiFetch<StockMovement[]>('/inventory/stock-movements'),
        apiFetch<User>('/auth/me'),
      ]);
      setProducts(productResult.items);
      setWarehouses(warehouseResult);
      setMovements(movementResult);
      setCurrentUser(currentUserResult);
      setForm((current) => ({
        ...current,
        productId: current.productId || productResult.items[0]?.id || '',
        warehouseId: current.warehouseId || warehouseResult[0]?.id || '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    try {
      await apiFetch('/inventory/stock-movements', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          unitCostKgs: form.unitCostKgs ? Number(form.unitCostKgs) : undefined,
          note: form.note || undefined,
        }),
      });
      setForm((current) => ({ ...current, quantity: '1', note: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('inventory.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('stockMovement.title')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {canCreateStockMovement(currentUser) ? (
          <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
            <Select label={t('stockMovement.product')} value={form.productId} onChange={(value) => setForm({ ...form, productId: value })} options={products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }))} />
            <Select label={t('stockMovement.warehouse')} value={form.warehouseId} onChange={(value) => setForm({ ...form, warehouseId: value })} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            <Select label={t('stockMovement.type')} value={form.type} onChange={(value) => setForm({ ...form, type: value as StockMovementType })} options={movementTypes.map((type) => ({ value: type, label: movementTypeLabel(type, t) }))} />
            <Input label={t('stockMovement.quantity')} type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
            <Input label={t('stockMovement.unitCost')} type="number" value={form.unitCostKgs} onChange={(value) => setForm({ ...form, unitCostKgs: value })} />
            <Input label={t('stockMovement.note')} value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
            <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white md:col-span-3" type="submit">{t('inventory.createStockMovement')}</button>
          </form>
        ) : null}

        <div className="h-[calc(100vh-360px)] min-h-[360px] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t('stockMovement.createdAt')}</th><th className="px-4 py-3">{t('stockMovement.product')}</th><th className="px-4 py-3">{t('stockMovement.warehouse')}</th><th className="px-4 py-3">{t('stockMovement.type')}</th><th className="px-4 py-3">{t('stockMovement.quantity')}</th><th className="px-4 py-3">{t('stockMovement.totalCost')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((movement) => (
                <tr key={movement.id}><td className="px-4 py-3">{new Date(movement.createdAt).toLocaleString()}</td><td className="px-4 py-3">{movement.product?.name}</td><td className="px-4 py-3">{movement.warehouse?.name}</td><td className="px-4 py-3">{movementTypeLabel(movement.type, t)}</td><td className="px-4 py-3">{movement.quantity}</td><td className="px-4 py-3">{formatKgs(movement.totalCostKgs)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} step={type === 'number' ? '0.01' : undefined} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function movementTypeLabel(type: StockMovementType, t: (key: string) => string) {
  const keys: Record<StockMovementType, string> = {
    IN: 'inventory.stockIn',
    OUT: 'inventory.stockOut',
    TRANSFER: 'inventory.transfer',
    ADJUSTMENT: 'inventory.adjustment',
    SALE: 'inventory.sale',
    SERVICE_USE: 'inventory.serviceUse',
    INVENTORY_ADJUSTMENT_IN: 'inventory.inventoryAdjustmentIn',
    INVENTORY_ADJUSTMENT_OUT: 'inventory.inventoryAdjustmentOut',
  };
  return t(keys[type]);
}
