'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { WarehouseDataTable } from '@/components/warehouse/WarehouseDataTable';
import { WarehousePageHeader } from '@/components/warehouse/WarehousePageHeader';
import { WarehousePagination } from '@/components/warehouse/WarehousePagination';
import { WarehouseProfileCard } from '@/components/warehouse/WarehouseProfileCard';
import { WarehouseStockToolbar } from '@/components/warehouse/WarehouseStockToolbar';
import { WarehouseSummaryGrid } from '@/components/warehouse/WarehouseSummaryGrid';
import { apiFetch } from '@/lib/api';
import { canEditBranchWarehouseProfile } from '@/lib/rbac';
import {
  filterStockRows,
  paginateRows,
  sortStockRows,
  uniqueSortedValues,
  type StockRow,
} from '@/lib/warehouse-stock-utils';
import type { SortDirection } from '@/lib/warehouse-list-utils';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const PAGE_SIZE = 10;

type WarehouseDetail = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  warehouseType?: string;
  contactPerson?: string | null;
  phone?: string | null;
  notes?: string | null;
  isActive: boolean;
  totalSkuCount: number;
  totalProductQuantity: number;
  totalStockValueKgs?: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockSkuCount?: number;
  lastMovementAt?: string | null;
  lastInventoryDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function BranchCeoWarehousePanel() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [warehouse, setWarehouse] = useState<WarehouseDetail | null>(null);
  const [products, setProducts] = useState<StockRow[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stockStatus, setStockStatus] = useState<'all' | 'low' | 'out'>('all');
  const [sortKey, setSortKey] = useState('product');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
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
      const stock = await apiFetch<StockRow[]>(`/branch-ceo/warehouse/${warehouseResult.id}/products`);
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

  const categoryOptions = useMemo(
    () => uniqueSortedValues(products.map((row) => row.categoryName)),
    [products],
  );

  const filteredProducts = useMemo(
    () =>
      sortStockRows(
        filterStockRows(products, { search, category, stockStatus }),
        sortKey,
        sortDirection,
      ),
    [products, search, category, stockStatus, sortKey, sortDirection],
  );

  const pagination = useMemo(
    () => paginateRows(filteredProducts, page, PAGE_SIZE),
    [filteredProducts, page],
  );

  const summaryItems = useMemo(
    () => [
      { label: t('hqWarehouse.totalProducts'), value: String(warehouse?.totalSkuCount ?? 0) },
      {
        label: t('hqWarehouse.totalValue'),
        value: `${(warehouse?.totalStockValueKgs ?? 0).toLocaleString()} KGS`,
      },
      { label: t('inventory.lowStock'), value: String(warehouse?.lowStockSkuCount ?? 0) },
      { label: t('hqWarehouse.totalStock'), value: String(warehouse?.totalProductQuantity ?? 0) },
    ],
    [t, warehouse],
  );

  const profileFields = useMemo(() => {
    if (!warehouse) return [];
    return [
      { label: t('warehouse.name'), value: warehouse.name },
      { label: t('warehouse.code'), value: warehouse.code },
      { label: t('warehouse.type'), value: t('warehouse.branchType') },
      { label: t('common.status'), value: warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive') },
      { label: t('hqWarehouse.contactPerson'), value: warehouse.contactPerson ?? '—' },
      { label: t('hqWarehouse.phone'), value: warehouse.phone ?? '—' },
      { label: t('warehouse.address'), value: warehouse.address ?? '—' },
      { label: t('hqWarehouse.city'), value: warehouse.city ?? '—' },
      { label: t('branchWarehouse.skuCount'), value: String(warehouse.totalSkuCount) },
      { label: t('hqWarehouse.totalStock'), value: String(warehouse.totalProductQuantity) },
      { label: t('branchWarehouse.totalReserved'), value: String(warehouse.reservedQuantity) },
      { label: t('branchWarehouse.totalAvailable'), value: String(warehouse.availableQuantity) },
      {
        label: t('branchWarehouse.lastInventory'),
        value: warehouse.lastInventoryDate ? new Date(warehouse.lastInventoryDate).toLocaleString() : '—',
      },
      {
        label: t('branchWarehouse.lastMovement'),
        value: warehouse.lastMovementAt ? new Date(warehouse.lastMovementAt).toLocaleString() : '—',
      },
      {
        label: t('common.createdDate'),
        value: warehouse.createdAt ? new Date(warehouse.createdAt).toLocaleString() : '—',
      },
      {
        label: t('common.lastUpdated'),
        value: warehouse.updatedAt ? new Date(warehouse.updatedAt).toLocaleString() : '—',
      },
    ];
  }, [t, warehouse]);

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

  function handleSort(nextKey: string) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  }

  function stockStatusLabel(status?: string) {
    if (status === 'OUT_OF_STOCK') return t('warehouse.outOfStock');
    if (status === 'LOW_STOCK') return t('inventory.lowStock');
    return t('warehouse.inStock');
  }

  if (!loading && !warehouse) {
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error || t('branchWarehouse.noWarehouseAssigned')}</p>;
  }

  return (
    <div className="space-y-6">
      <WarehousePageHeader
        eyebrow={t('hqWarehouse.title')}
        title={t('branchCeo.warehouseTitle')}
        description={t('branchCeo.warehouseDescription')}
      />

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

      <WarehouseSummaryGrid loading={loading} items={summaryItems} skeletonCount={4} />

      <WarehouseStockToolbar
        search={search}
        category={category}
        stockStatus={stockStatus}
        categoryOptions={categoryOptions}
        searchPlaceholder={t('warehouse.searchStockPlaceholder')}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCategoryChange={(value) => {
          setCategory(value);
          setPage(1);
        }}
        onStockStatusChange={(value) => {
          setStockStatus(value);
          setPage(1);
        }}
      />

      <WarehouseProfileCard
        fields={profileFields}
        action={
          canEditBranchWarehouseProfile(user) ? (
            <button
              type="button"
              onClick={() => setEditing((current) => !current)}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {t('hqWarehouse.editWarehouse')}
            </button>
          ) : null
        }
      >
        {editing ? (
          <form onSubmit={saveWarehouse} className="mt-6 grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-2">
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
              <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.notes')}</span>
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
      </WarehouseProfileCard>

      <WarehouseDataTable
        columns={[
          {
            key: 'product',
            label: t('inventory.products'),
            sortable: true,
            render: (row) => <span className="font-bold">{row.product.name}</span>,
          },
          {
            key: 'sku',
            label: t('branchWarehouse.productCode'),
            sortable: true,
            render: (row) => row.sku,
          },
          {
            key: 'categoryName',
            label: t('inventory.category'),
            sortable: true,
            render: (row) => row.categoryName ?? '—',
          },
          {
            key: 'quantity',
            label: t('branchWarehouse.onHand'),
            sortable: true,
            render: (row) => row.quantity,
          },
          {
            key: 'reservedQuantity',
            label: t('branchWarehouse.reserved'),
            sortable: true,
            render: (row) => row.reservedQuantity,
          },
          {
            key: 'availableQuantity',
            label: t('branchWarehouse.available'),
            sortable: true,
            render: (row) => row.availableQuantity,
          },
          {
            key: 'minStockLevel',
            label: t('inventory.minStockLevel'),
            sortable: true,
            render: (row) => row.minStockLevel ?? 0,
          },
          {
            key: 'status',
            label: t('warehouse.stockStatus'),
            sortable: true,
            render: (row) => stockStatusLabel(row.stockStatus),
          },
          {
            key: 'totalValueKgs',
            label: t('branchWarehouse.stockValue'),
            sortable: true,
            render: (row) => `${(row.totalValueKgs ?? 0).toLocaleString()} KGS`,
          },
          {
            key: 'lastMovementAt',
            label: t('branchWarehouse.lastMovement'),
            sortable: true,
            render: (row) => (row.lastMovementAt ? new Date(row.lastMovementAt).toLocaleDateString() : '—'),
          },
        ]}
        rows={pagination.items}
        rowKey={(row) => row.id}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
        emptyLabel={t('branchWarehouseOperator.emptyStock')}
      />

      <WarehousePagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        total={pagination.total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
