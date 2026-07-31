'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { WarehouseDataTable } from '@/components/warehouse/WarehouseDataTable';
import { WarehouseListToolbar } from '@/components/warehouse/WarehouseListToolbar';
import { WarehousePagination } from '@/components/warehouse/WarehousePagination';
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard';
import { apiFetch } from '@/lib/api';
import { canInspectAnyBranchWarehouse, isBranchOwnerUser } from '@/lib/rbac';
import type { User } from '@/lib/types';
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
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [warehouses, setWarehouses] = useState<BranchWarehouseMetrics[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState('branchName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

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
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const canFilterByBranch = canInspectAnyBranchWarehouse(user);
  const branchOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const warehouse of warehouses) {
      if (warehouse.branchId && warehouse.branchName) {
        unique.set(warehouse.branchId, warehouse.branchName);
      }
    }
    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [warehouses]);

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

        {canFilterByBranch ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span>{t('branchWarehouse.filterBranch')}</span>
              <select
                value={branchFilter}
                onChange={(event) => {
                  setBranchFilter(event.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t('branchWarehouse.allBranches')}</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

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
                  href={`/branch-warehouses/${row.id}${row.branchId ? `?fromBranch=${row.branchId}` : ''}`}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
                  {t('branchWarehouse.openWarehouse')}
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
