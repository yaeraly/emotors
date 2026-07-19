'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SectionTopNav } from '@/components/SectionTopNav';
import { InventoryCountListContent } from '@/components/inventory/InventoryCountListContent';
import { WarehousePageHeader } from '@/components/warehouse/WarehousePageHeader';
import { WarehouseSummaryGrid } from '@/components/warehouse/WarehouseSummaryGrid';
import { WarehouseDataTable } from '@/components/warehouse/WarehouseDataTable';
import { WarehouseListToolbar } from '@/components/warehouse/WarehouseListToolbar';
import { WarehousePagination } from '@/components/warehouse/WarehousePagination';
import { apiFetch } from '@/lib/api';
import { canCreateHqInventoryCount, canManageHqWarehouse, hasFullAccess, isWarehouseManagerUser } from '@/lib/rbac';
import { formatHqWarehouseContactPerson } from '@/lib/hq-warehouse';
import {
  filterWarehouseRows,
  paginateRows,
  sortWarehouseRows,
  type SortDirection,
  type StatusFilter,
  uniqueSortedValues,
} from '@/lib/warehouse-list-utils';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const PAGE_SIZE = 10;

type HqTab = 'warehouses' | 'inventory';

type Dashboard = {
  totalHqWarehouses: number;
  totalProducts: number;
  totalStock: number;
  totalInventoryValueKgs: number;
  totalReserved: number;
  totalAvailable: number;
  pendingTransfers: number;
};

type WarehouseMetrics = Warehouse & {
  country?: string | null;
  city?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  totalSkuCount?: number;
  totalProductQuantity?: number;
  totalStockValueKgs?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  hasDeleteHistory?: boolean;
};

export default function HqWarehousesPage() {
  return (
    <Suspense
      fallback={
        <ProtectedShell>
          <p className="p-6 text-slate-500">...</p>
        </ProtectedShell>
      }
    >
      <HqWarehousesPageContent />
    </Suspense>
  );
}

function HqWarehousesPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: HqTab = tabParam === 'inventory' ? 'inventory' : 'warehouses';
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const success = window.localStorage.getItem('emotors_warehouse_success');
    if (success) {
      setSuccess(success);
      window.localStorage.removeItem('emotors_warehouse_success');
    }
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const me = await apiFetch<User>('/auth/me');
      const [stats, list] = await Promise.all([
        apiFetch<Dashboard>('/hq-warehouses/dashboard'),
        apiFetch<WarehouseMetrics[]>('/hq-warehouses'),
      ]);
      setUser(me);
      setDashboard(stats);
      const normalized = list.map((warehouse) => ({
        ...warehouse,
        country: warehouse.country ?? 'Kyrgyzstan',
      }));
      setWarehouses(normalized);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  const isWmScopedView = isWarehouseManagerUser(user) && !hasFullAccess(user);

  const regionOptions = useMemo(
    () => uniqueSortedValues(warehouses.map((warehouse) => warehouse.country ?? 'Kyrgyzstan')),
    [warehouses],
  );
  const cityOptions = useMemo(
    () => uniqueSortedValues(warehouses.map((warehouse) => warehouse.city)),
    [warehouses],
  );

  const filteredWarehouses = useMemo(
    () =>
      sortWarehouseRows(
        filterWarehouseRows(warehouses, { search, region, city, status }),
        sortKey,
        sortDirection,
        {
          name: (row) => row.name,
          city: (row) => row.city ?? '',
          code: (row) => row.code,
          totalSkuCount: (row) => row.totalSkuCount ?? 0,
          totalProductQuantity: (row) => row.totalProductQuantity ?? 0,
          totalStockValueKgs: (row) => row.totalStockValueKgs ?? 0,
          reservedQuantity: (row) => row.reservedQuantity ?? 0,
          availableQuantity: (row) => row.availableQuantity ?? 0,
          isActive: (row) => (row.isActive ? 1 : 0),
        },
      ),
    [warehouses, search, region, city, status, sortKey, sortDirection],
  );

  const pagination = useMemo(
    () => paginateRows(filteredWarehouses, page, PAGE_SIZE),
    [filteredWarehouses, page],
  );

  const summary = useMemo(
    () => ({
      totalHqWarehouses: filteredWarehouses.length,
      totalProducts: filteredWarehouses.reduce((sum, row) => sum + (row.totalSkuCount ?? 0), 0),
      totalStock: filteredWarehouses.reduce((sum, row) => sum + (row.totalProductQuantity ?? 0), 0),
      totalInventoryValueKgs: filteredWarehouses.reduce((sum, row) => sum + (row.totalStockValueKgs ?? 0), 0),
      totalReserved: filteredWarehouses.reduce((sum, row) => sum + (row.reservedQuantity ?? 0), 0),
      totalAvailable: filteredWarehouses.reduce((sum, row) => sum + (row.availableQuantity ?? 0), 0),
    }),
    [filteredWarehouses],
  );

  const displaySummary = useMemo(() => {
    if (isWmScopedView && dashboard) {
      return {
        totalHqWarehouses: dashboard.totalHqWarehouses,
        totalProducts: dashboard.totalProducts,
        totalStock: dashboard.totalStock,
        totalInventoryValueKgs: dashboard.totalInventoryValueKgs,
        totalReserved: dashboard.totalReserved,
        totalAvailable: dashboard.totalAvailable,
      };
    }
    return summary;
  }, [dashboard, isWmScopedView, summary]);

  const wmHasNoAssignment = isWmScopedView && !loading && warehouses.length === 0;

  function handleSort(nextKey: string) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  }

  const hqTabs = useMemo(
    () => [
      { id: 'warehouses', label: t('scm.sidebar.hqWarehouses') },
      { id: 'inventory', label: t('scm.hub.warehouse.stocktake') },
    ],
    [t],
  );

  const createAction =
    activeTab === 'warehouses' && canManageHqWarehouse(user)
      ? { href: '/hq-warehouses/new', label: t('hqWarehouse.create') }
      : activeTab === 'inventory' && canCreateHqInventoryCount(user)
        ? { href: '/inventory/count/new', label: t('inventoryCount.newInventory') }
        : null;

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <WarehousePageHeader
          eyebrow={t('hqWarehouse.title')}
          title={t('hqWarehouse.list')}
          description={t('hqWarehouse.listDescription')}
        />

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <SectionTopNav
          tabs={hqTabs}
          activeTab={activeTab}
          onTabChange={(tabId) => router.replace(`/hq-warehouses?tab=${tabId}`)}
          action={
            createAction ? (
              <Link href={createAction.href} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
                {createAction.label}
              </Link>
            ) : null
          }
        />

        {activeTab === 'inventory' ? (
          <InventoryCountListContent />
        ) : (
          <>
        {loading ? (
          <WarehouseSummaryGrid loading skeletonCount={6} items={[]} />
        ) : wmHasNoAssignment ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
            {t('hqWarehouse.noWarehouseAssigned')}
          </p>
        ) : (
          <>
        <WarehouseSummaryGrid
          items={[
            { label: t('hqWarehouse.totalWarehouses'), value: String(displaySummary.totalHqWarehouses) },
            { label: t('hqWarehouse.totalProducts'), value: String(displaySummary.totalProducts) },
            { label: t('hqWarehouse.totalStock'), value: String(displaySummary.totalStock) },
            ...(!isWmScopedView
              ? [{ label: t('hqWarehouse.totalValue'), value: `${(displaySummary.totalInventoryValueKgs ?? 0).toLocaleString()} KGS` }]
              : []),
            { label: t('branchWarehouse.totalReserved'), value: String(displaySummary.totalReserved) },
            { label: t('branchWarehouse.totalAvailable'), value: String(displaySummary.totalAvailable) },
          ]}
        />

        {!isWmScopedView && dashboard ? (
          <p className="text-sm text-slate-500">
            {t('hqWarehouse.pendingTransfers')}: {dashboard.pendingTransfers}
          </p>
        ) : null}

        {!isWmScopedView ? (
        <WarehouseListToolbar
          search={search}
          region={region}
          city={city}
          status={status}
          regionOptions={regionOptions}
          cityOptions={cityOptions}
          searchPlaceholder={t('warehouse.searchHqPlaceholder')}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onRegionChange={(value) => {
            setRegion(value);
            setPage(1);
          }}
          onCityChange={(value) => {
            setCity(value);
            setPage(1);
          }}
          onStatusChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        ) : null}

        <WarehouseDataTable
          columns={[
            {
              key: 'name',
              label: t('warehouse.name'),
              sortable: true,
              render: (row) => <span className="font-bold">{row.name}</span>,
            },
            {
              key: 'city',
              label: t('hqWarehouse.city'),
              sortable: true,
              render: (row) => row.city ?? '—',
            },
            ...(isWmScopedView
              ? [{
                  key: 'address',
                  label: t('warehouse.address'),
                  render: (row: WarehouseMetrics) => row.address ?? '—',
                }]
              : [{
                  key: 'code',
                  label: t('warehouse.code'),
                  sortable: true,
                  render: (row: WarehouseMetrics) => row.code,
                }]),
            {
              key: 'contactPerson',
              label: t('hqWarehouse.contactPerson'),
              render: (row) => (
                <span className="text-sm text-slate-700">{formatHqWarehouseContactPerson(row, t)}</span>
              ),
            },
            {
              key: 'totalSkuCount',
              label: t('branchWarehouse.skuCount'),
              sortable: true,
              render: (row) => row.totalSkuCount ?? 0,
            },
            {
              key: 'totalProductQuantity',
              label: t('hqWarehouse.totalStock'),
              sortable: true,
              render: (row) => row.totalProductQuantity ?? 0,
            },
            ...(!isWmScopedView
              ? [{
                  key: 'totalStockValueKgs',
                  label: t('hqWarehouse.totalValue'),
                  sortable: true,
                  render: (row: WarehouseMetrics) => `${(row.totalStockValueKgs ?? 0).toLocaleString()} KGS`,
                }]
              : []),
            {
              key: 'reservedQuantity',
              label: t('branchWarehouse.reserved'),
              sortable: true,
              render: (row) => row.reservedQuantity ?? 0,
            },
            {
              key: 'availableQuantity',
              label: t('branchWarehouse.available'),
              sortable: true,
              render: (row) => row.availableQuantity ?? 0,
            },
            ...(!isWmScopedView
              ? [{
                  key: 'isActive',
                  label: t('common.status'),
                  sortable: true,
                  render: (row: WarehouseMetrics) => (row.isActive ? t('warehouse.active') : t('warehouse.inactive')),
                }]
              : []),
            {
              key: 'actions',
              label: t('common.actions'),
              render: (row) => (
                <Link href={`/hq-warehouses/${row.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                  {t('common.open')}
                </Link>
              ),
            },
          ]}
          rows={pagination.items}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          emptyLabel={wmHasNoAssignment ? t('hqWarehouse.noWarehouseAssigned') : t('warehouse.list')}
        />

        {!wmHasNoAssignment ? (
        <WarehousePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
        ) : null}
          </>
        )}
          </>
        )}
      </section>
    </ProtectedShell>
  );
}
