'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { WarehouseDataTable } from '@/components/warehouse/WarehouseDataTable';
import { WarehouseListToolbar } from '@/components/warehouse/WarehouseListToolbar';
import { WarehousePagination } from '@/components/warehouse/WarehousePagination';
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard';
import { apiFetch } from '@/lib/api';
import {
  buildBranchWarehousesListQuery,
  branchWarehousesListHref,
  EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS,
  parseBranchWarehousesListFilters,
} from '@/lib/branch-warehouses-list';
import { canInspectAnyBranchWarehouse, isBranchOwnerUser } from '@/lib/rbac';
import type { Branch, User } from '@/lib/types';
import {
  filterWarehouseRows,
  paginateRows,
  sortWarehouseRows,
  type SortDirection,
  type StatusFilter,
  uniqueSortedValues,
} from '@/lib/warehouse-list-utils';
import { useTranslation } from '@/i18n/useTranslation';

const PAGE_SIZE = 10;

type BranchWarehouseMetrics = {
  id: string;
  name: string;
  code: string;
  branchId?: string | null;
  city?: string | null;
  country?: string | null;
  branchName?: string | null;
  branchOwnerName?: string | null;
  totalSkuCount: number;
  totalProductQuantity: number;
  totalStockValueKgs: number;
  reservedQuantity: number;
  availableQuantity: number;
  lastInventoryDate?: string | null;
  isActive: boolean;
};

export default function BranchWarehousesPage() {
  return (
    <Suspense
      fallback={
        <ProtectedShell>
          <p className="p-6 text-slate-500">...</p>
        </ProtectedShell>
      }
    >
      <BranchWarehousesPageContent />
    </Suspense>
  );
}

function BranchWarehousesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [warehouses, setWarehouses] = useState<BranchWarehouseMetrics[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState('branchName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    const successMessage = window.localStorage.getItem('emotors_warehouse_success');
    if (successMessage) {
      setSuccess(successMessage);
      window.localStorage.removeItem('emotors_warehouse_success');
    }
    Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<BranchWarehouseMetrics[]>('/branch-warehouses'),
    ])
      .then(([me, list]) => {
        setUser(me);
        if (isBranchOwnerUser(me) && !canInspectAnyBranchWarehouse(me)) {
          router.replace('/branch-ceo/warehouse');
          return;
        }
        setWarehouses(
          list.map((warehouse) => ({
            ...warehouse,
            country: warehouse.country ?? 'Kyrgyzstan',
          })),
        );
        if (canInspectAnyBranchWarehouse(me)) {
          void apiFetch<Branch[]>('/branches')
            .then(setBranches)
            .catch(() => setBranches([]));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [router, t]);

  useEffect(() => {
    const parsed = parseBranchWarehousesListFilters(searchParams);
    setSearch(parsed.search);
    setBranchFilter(parsed.branchId);
    setRegion(parsed.region);
    setCity(parsed.city);
    setStatus(parsed.status);
    setPage(parsed.page);
    setFiltersReady(true);
  }, [searchParams]);

  const canFilterByBranch = canInspectAnyBranchWarehouse(user);

  const branchOptions = useMemo(() => {
    if (branches.length > 0) {
      return branches
        .map((branch) => ({ id: branch.id, name: branch.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const unique = new Map<string, string>();
    for (const warehouse of warehouses) {
      if (warehouse.branchId && warehouse.branchName) {
        unique.set(warehouse.branchId, warehouse.branchName);
      }
    }
    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [branches, warehouses]);

  const scopedWarehouses = useMemo(() => {
    if (!branchFilter) return warehouses;
    return warehouses.filter((warehouse) => warehouse.branchId === branchFilter);
  }, [warehouses, branchFilter]);

  const regionOptions = useMemo(
    () => uniqueSortedValues(scopedWarehouses.map((warehouse) => warehouse.country ?? 'Kyrgyzstan')),
    [scopedWarehouses],
  );
  const cityOptions = useMemo(
    () => uniqueSortedValues(scopedWarehouses.map((warehouse) => warehouse.city)),
    [scopedWarehouses],
  );

  const listFilters = useMemo(
    () => ({ search, branchId: branchFilter, region, city, status, page }),
    [search, branchFilter, region, city, status, page],
  );

  useEffect(() => {
    if (!filtersReady) return;
    const nextQuery = buildBranchWarehousesListQuery(listFilters);
    const currentQuery = searchParams.toString();
    const normalizedCurrent = currentQuery ? `?${currentQuery}` : '';
    if (nextQuery !== normalizedCurrent) {
      router.replace(branchWarehousesListHref(listFilters), { scroll: false });
    }
  }, [filtersReady, listFilters, router, searchParams]);

  const filteredWarehouses = useMemo(
    () =>
      sortWarehouseRows(
        filterWarehouseRows(scopedWarehouses, { search, region, city, status }),
        sortKey,
        sortDirection,
        {
          branchName: (row) => row.branchName ?? '',
          branchOwnerName: (row) => row.branchOwnerName ?? '',
          name: (row) => row.name,
          city: (row) => row.city ?? '',
          totalSkuCount: (row) => row.totalSkuCount,
          totalProductQuantity: (row) => row.totalProductQuantity,
          totalStockValueKgs: (row) => row.totalStockValueKgs,
          reservedQuantity: (row) => row.reservedQuantity,
          availableQuantity: (row) => row.availableQuantity,
          isActive: (row) => (row.isActive ? 1 : 0),
          lastInventoryDate: (row) => row.lastInventoryDate ?? '',
        },
      ),
    [scopedWarehouses, search, region, city, status, sortKey, sortDirection],
  );

  const pagination = useMemo(
    () => paginateRows(filteredWarehouses, page, PAGE_SIZE),
    [filteredWarehouses, page],
  );

  const summary = useMemo(
    () => ({
      totalBranchWarehouses: filteredWarehouses.length,
      totalSku: filteredWarehouses.reduce((sum, row) => sum + row.totalSkuCount, 0),
      totalQuantity: filteredWarehouses.reduce((sum, row) => sum + row.totalProductQuantity, 0),
      totalInventoryValueKgs: filteredWarehouses.reduce((sum, row) => sum + row.totalStockValueKgs, 0),
      totalReserved: filteredWarehouses.reduce((sum, row) => sum + row.reservedQuantity, 0),
      totalAvailable: filteredWarehouses.reduce((sum, row) => sum + row.availableQuantity, 0),
    }),
    [filteredWarehouses],
  );

  function handleSort(nextKey: string) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  }

  function handleBranchChange(value: string) {
    setBranchFilter(value);
    setPage(1);
    const nextScoped = value
      ? warehouses.filter((warehouse) => warehouse.branchId === value)
      : warehouses;
    const nextRegions = uniqueSortedValues(
      nextScoped.map((warehouse) => warehouse.country ?? 'Kyrgyzstan'),
    );
    const nextCities = uniqueSortedValues(nextScoped.map((warehouse) => warehouse.city));
    if (region && !nextRegions.includes(region)) setRegion('');
    if (city && !nextCities.includes(city)) setCity('');
  }

  function clearFilters() {
    setSearch(EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS.search);
    setBranchFilter(EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS.branchId);
    setRegion(EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS.region);
    setCity(EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS.city);
    setStatus(EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS.status);
    setPage(EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS.page);
  }

  function warehouseOpenHref(row: BranchWarehouseMetrics) {
    const listReturn = encodeURIComponent(branchWarehousesListHref(listFilters));
    const fromBranch = row.branchId ? `fromBranch=${row.branchId}` : '';
    const params = [`listReturn=${listReturn}`];
    if (fromBranch) params.unshift(fromBranch);
    return `/branch-warehouses/${row.id}?${params.join('&')}`;
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchWarehouse.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('branchWarehouse.title')}</h2>
          </div>
        </div>

        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
          <WarehouseSummaryCard compact label={t('branchWarehouse.totalWarehouses')} value={String(summary.totalBranchWarehouses)} />
          <WarehouseSummaryCard compact label={t('branchWarehouse.skuCount')} value={String(summary.totalSku)} />
          <WarehouseSummaryCard compact label={t('hqWarehouse.totalStock')} value={String(summary.totalQuantity)} />
          <WarehouseSummaryCard compact label={t('hqWarehouse.totalValue')} value={`${summary.totalInventoryValueKgs.toLocaleString()} KGS`} />
          <WarehouseSummaryCard compact label={t('branchWarehouse.totalReserved')} value={String(summary.totalReserved)} />
          <WarehouseSummaryCard compact label={t('branchWarehouse.totalAvailable')} value={String(summary.totalAvailable)} />
        </div>

        <WarehouseListToolbar
          search={search}
          region={region}
          city={city}
          status={status}
          regionOptions={regionOptions}
          cityOptions={cityOptions}
          searchPlaceholder={t('warehouse.searchBranchPlaceholder')}
          branchId={branchFilter}
          branchOptions={canFilterByBranch ? branchOptions : undefined}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onBranchChange={canFilterByBranch ? handleBranchChange : undefined}
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
          onClear={clearFilters}
        />

        <WarehouseDataTable
          columns={[
            {
              key: 'branchName',
              label: t('branchWarehouse.branchName'),
              sortable: true,
              render: (row) => <span className="font-semibold text-slate-900">{row.branchName ?? '—'}</span>,
            },
            {
              key: 'name',
              label: t('warehouse.name'),
              sortable: true,
              render: (row) => <span className="font-bold">{row.name}</span>,
            },
            {
              key: 'branchOwnerName',
              label: t('users.branchOwnerDetails'),
              sortable: true,
              render: (row) => row.branchOwnerName?.trim() || t('branchWarehouse.ownerNotAssigned'),
            },
            {
              key: 'city',
              label: t('hqWarehouse.city'),
              sortable: true,
              render: (row) => row.city ?? '—',
            },
            {
              key: 'totalSkuCount',
              label: t('branchWarehouse.skuCount'),
              sortable: true,
              render: (row) => row.totalSkuCount,
            },
            {
              key: 'totalProductQuantity',
              label: t('hqWarehouse.totalStock'),
              sortable: true,
              render: (row) => row.totalProductQuantity,
            },
            {
              key: 'totalStockValueKgs',
              label: t('hqWarehouse.totalValue'),
              sortable: true,
              render: (row) => `${row.totalStockValueKgs.toLocaleString()} KGS`,
            },
            {
              key: 'isActive',
              label: t('common.status'),
              sortable: true,
              render: (row) => (row.isActive ? t('warehouse.active') : t('warehouse.inactive')),
            },
            {
              key: 'lastInventoryDate',
              label: t('branchWarehouse.lastInventory'),
              sortable: true,
              render: (row) =>
                row.lastInventoryDate ? new Date(row.lastInventoryDate).toLocaleDateString() : '—',
            },
            {
              key: 'actions',
              label: t('common.actions'),
              render: (row) => (
                <Link
                  href={warehouseOpenHref(row)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
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
          emptyLabel={t('warehouse.list')}
        />

        <WarehousePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </section>
    </ProtectedShell>
  );
}
