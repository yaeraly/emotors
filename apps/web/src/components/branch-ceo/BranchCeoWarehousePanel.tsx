'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard';
import { apiFetch } from '@/lib/api';
import { canEditBranchWarehouseProfile } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type WarehouseDetail = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  notes?: string | null;
  isActive: boolean;
  totalSkuCount: number;
  totalProductQuantity: number;
  totalStockValueKgs: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockSkuCount?: number;
  lastMovementAt?: string | null;
  lastInventoryDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ProductRow = {
  id: string;
  sku: string;
  product: { name: string };
  categoryName?: string | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  landedCostKgs?: number;
  totalValueKgs?: number;
  lastMovementAt?: string | null;
  status: string;
};

export function BranchCeoWarehousePanel() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [warehouse, setWarehouse] = useState<WarehouseDetail | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    city: '',
    address: '',
    contactPerson: '',
    phone: '',
    notes: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [me, warehouseResult] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<WarehouseDetail>('/branch-ceo/warehouse'),
      ]);
      setUser(me);
      setWarehouse(warehouseResult);
      setForm({
        name: warehouseResult.name,
        city: warehouseResult.city ?? '',
        address: warehouseResult.address ?? '',
        contactPerson: warehouseResult.contactPerson ?? '',
        phone: warehouseResult.phone ?? '',
        notes: warehouseResult.notes ?? '',
      });
      const stock = await apiFetch<ProductRow[]>(`/branch-ceo/warehouse/${warehouseResult.id}/products`);
      setProducts(stock);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (row) =>
        row.product.name.toLowerCase().includes(query) ||
        row.sku.toLowerCase().includes(query) ||
        (row.categoryName ?? '').toLowerCase().includes(query),
    );
  }, [products, search]);

  async function saveWarehouse(event: FormEvent) {
    event.preventDefault();
    if (!warehouse) return;
    setSaving(true);
    setError('');
    try {
      const updated = await apiFetch<WarehouseDetail>('/branch-ceo/warehouse', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      setWarehouse(updated);
      setEditing(false);
      setSuccess(t('branchCeo.warehouseUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="mt-2 h-6 w-12 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!warehouse) {
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error || t('branchWarehouseOperator.emptyStock')}</p>;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
        <WarehouseSummaryCard compact label={t('inventory.totalProducts')} value={String(warehouse.totalSkuCount)} />
        <WarehouseSummaryCard
          compact
          label={t('inventory.totalStockValue')}
          value={`${warehouse.totalStockValueKgs.toLocaleString()} KGS`}
        />
        <WarehouseSummaryCard compact label={t('inventory.lowStockCount')} value={String(warehouse.lowStockSkuCount ?? 0)} />
        <WarehouseSummaryCard compact label={t('inventory.totalQuantity')} value={String(warehouse.totalProductQuantity)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('common.search')}
          className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventory/count"
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700"
          >
            {t('inventoryCount.submittedForApproval')}
          </Link>
          {canEditBranchWarehouseProfile(user) ? (
            <button
              type="button"
              onClick={() => setEditing((current) => !current)}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {t('branchCeo.editWarehouse')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem label={t('warehouse.name')} value={warehouse.name} />
          <InfoItem label={t('branchWarehouse.productCode')} value={warehouse.code} />
          <InfoItem label={t('branchWarehouse.branchName')} value={warehouse.branchName ?? '—'} />
          <InfoItem label={t('branchWarehouse.status')} value={warehouse.isActive ? t('common.active') : t('common.inactive')} />
          <InfoItem label={t('hqWarehouse.contactPerson')} value={warehouse.contactPerson ?? '—'} />
          <InfoItem label={t('hqWarehouse.phone')} value={warehouse.phone ?? '—'} />
          <InfoItem label={t('warehouse.address')} value={warehouse.address ?? '—'} />
          <InfoItem label={t('warehouse.city')} value={warehouse.city ?? '—'} />
          <InfoItem label={t('hqWarehouse.totalProducts')} value={String(warehouse.totalSkuCount)} />
          <InfoItem label={t('hqWarehouse.totalStock')} value={String(warehouse.totalProductQuantity)} />
          <InfoItem label={t('branchWarehouse.totalReserved')} value={String(warehouse.reservedQuantity)} />
          <InfoItem label={t('branchWarehouse.totalAvailable')} value={String(warehouse.availableQuantity)} />
          <InfoItem
            label={t('branchWarehouse.lastInventory')}
            value={warehouse.lastInventoryDate ? new Date(warehouse.lastInventoryDate).toLocaleString() : '—'}
          />
          <InfoItem
            label={t('branchWarehouse.lastMovement')}
            value={warehouse.lastMovementAt ? new Date(warehouse.lastMovementAt).toLocaleString() : '—'}
          />
        </div>
      </div>

      {editing ? (
        <form onSubmit={saveWarehouse} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('warehouse.name')}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('warehouse.city')}</span>
            <input
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('warehouse.address')}</span>
            <input
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.contactPerson')}</span>
            <input
              value={form.contactPerson}
              onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.phone')}</span>
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('inventoryCount.notes')}</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('sales.product')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.productCode')}</th>
              <th className="px-4 py-3">{t('inventory.category')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.onHand')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.reserved')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.available')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.averageCost')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.stockValue')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.lastMovement')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">{row.product.name}</td>
                <td className="px-4 py-3">{row.sku}</td>
                <td className="px-4 py-3">{row.categoryName ?? '—'}</td>
                <td className="px-4 py-3">{row.quantity}</td>
                <td className="px-4 py-3">{row.reservedQuantity}</td>
                <td className="px-4 py-3">{row.availableQuantity}</td>
                <td className="px-4 py-3">{row.landedCostKgs ?? '—'}</td>
                <td className="px-4 py-3">{row.totalValueKgs ?? '—'}</td>
                <td className="px-4 py-3">
                  {row.lastMovementAt ? new Date(row.lastMovementAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {!filteredProducts.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  {t('branchWarehouseOperator.emptyStock')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
