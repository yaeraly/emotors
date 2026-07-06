'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { SectionTopNav } from '@/components/SectionTopNav';
import { InventoryCountListContent } from '@/components/inventory/InventoryCountListContent';
import { WarehouseDataTable } from '@/components/warehouse/WarehouseDataTable';
import { WarehouseListToolbar } from '@/components/warehouse/WarehouseListToolbar';
import { WarehousePagination } from '@/components/warehouse/WarehousePagination';
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { canManageHqWarehouse, canDeleteHqWarehouse, canCreateHqInventoryCount } from '@/lib/rbac';
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
  pendingTransfers: number;
};

type WarehouseMetrics = Warehouse & {
  country?: string | null;
  city?: string | null;
  managers?: Array<{ id: string; fullName: string }>;
  totalSkuCount?: number;
  totalProductQuantity?: number;
  totalStockValueKgs?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleteRequireReason, setDeleteRequireReason] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [me, stats, list] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<Dashboard>('/hq-warehouses/dashboard'),
        apiFetch<WarehouseMetrics[]>('/hq-warehouses'),
      ]);
      setUser(me);
      setDashboard(stats);
      setWarehouses(
        list.map((warehouse) => ({
          ...warehouse,
          country: warehouse.country ?? 'Kyrgyzstan',
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const canDelete = canDeleteHqWarehouse(user);

  async function confirmDelete(reason?: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const result = await apiFetch<{ archived?: boolean }>(`/hq-warehouses/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setSuccess(result.archived ? t('hqWarehouse.archivedInstead') : t('hqWarehouse.deletedSuccess'));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('reason is required')) {
        setDeleteRequireReason(true);
      }
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

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
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('hqWarehouse.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('hqWarehouse.list')}</h2>
        </div>

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <WarehouseSummaryCard label={t('hqWarehouse.totalWarehouses')} value={String(summary.totalHqWarehouses)} />
          <WarehouseSummaryCard label={t('hqWarehouse.totalProducts')} value={String(summary.totalProducts)} />
          <WarehouseSummaryCard label={t('hqWarehouse.totalStock')} value={String(summary.totalStock)} />
          <WarehouseSummaryCard
            label={t('hqWarehouse.totalValue')}
            value={`${summary.totalInventoryValueKgs.toLocaleString()} KGS`}
          />
          <WarehouseSummaryCard label={t('branchWarehouse.totalReserved')} value={String(summary.totalReserved)} />
          <WarehouseSummaryCard label={t('branchWarehouse.totalAvailable')} value={String(summary.totalAvailable)} />
        </div>

        {dashboard ? (
          <p className="text-sm text-slate-500">
            {t('hqWarehouse.pendingTransfers')}: {dashboard.pendingTransfers}
          </p>
        ) : null}

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
            {
              key: 'code',
              label: t('warehouse.code'),
              sortable: true,
              render: (row) => row.code,
            },
            {
              key: 'managers',
              label: t('hqWarehouse.managers'),
              render: (row) =>
                row.managers?.length ? (
                  <span className="text-sm text-slate-700">{row.managers.map((manager) => manager.fullName).join(', ')}</span>
                ) : (
                  <span className="text-sm text-slate-400">—</span>
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
            {
              key: 'totalStockValueKgs',
              label: t('hqWarehouse.totalValue'),
              sortable: true,
              render: (row) => `${(row.totalStockValueKgs ?? 0).toLocaleString()} KGS`,
            },
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
            {
              key: 'isActive',
              label: t('common.status'),
              sortable: true,
              render: (row) => (row.isActive ? t('warehouse.active') : t('warehouse.inactive')),
            },
            {
              key: 'actions',
              label: t('common.actions'),
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/hq-warehouses/${row.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                    {t('common.open')}
                  </Link>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(row);
                        setDeleteRequireReason(false);
                        setError('');
                      }}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  ) : null}
                </div>
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
          </>
        )}
      </section>

      <DeleteConfirmModal
        open={!!deleteTarget}
        title={t('common.deleteConfirmTitle')}
        message={t('common.deleteConfirmMessage')}
        requireReason={deleteRequireReason}
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </ProtectedShell>
  );
}
