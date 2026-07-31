'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BranchWarehouseDeleteConfirmModal } from '@/components/BranchWarehouseDeleteConfirmModal';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canDeleteBranchWarehouse, canEditWarehouseInfo, canInspectAnyBranchWarehouse } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type Tab = 'products' | 'stock' | 'movements' | 'inventory' | 'receiving' | 'distribution';

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
  lastMovementAt?: string | null;
  lastInventoryDate?: string | null;
  permissions?: { canEdit: boolean; readOnly: boolean };
};

type BranchOption = {
  id: string;
  name: string;
  code: string;
};

type ProductRow = {
  id: string;
  sku: string;
  product: { name: string };
  categoryName?: string | null;
  supplierName?: string | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  landedCostKgs?: number;
  totalValueKgs?: number;
  lastMovementAt?: string | null;
  sellingPriceKgs?: number;
  status: string;
};

type StockRow = {
  id: string;
  sku: string;
  product: { name: string };
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  landedCostKgs: number;
  lastReceivingAt?: string | null;
};

type MovementRow = {
  id: string;
  type: string;
  quantity: number;
  createdAt: string;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  product?: { sku: string; name: string };
  createdBy?: { fullName: string };
  warehouse?: { name: string };
};

type InventoryRow = {
  id: string;
  sessionNumber: string;
  inventoryType: string;
  status: string;
  createdAt: string;
  approvedAt?: string | null;
  createdBy?: { fullName: string };
  approvedBy?: { fullName: string };
  productCount: number;
  shortageValueKgs: number;
  surplusValueKgs: number;
  netDifferenceValueKgs: number;
};

type ReceivingRow = {
  id: string;
  receivingNumber: string;
  receivedAt: string;
  items?: Array<{ id: string }>;
  distributionOrder?: { orderNumber: string };
};

type DistributionRow = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  branch?: { name: string };
  sourceWarehouse?: { name: string };
};

export default function BranchWarehouseDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const fromBranchId = searchParams.get('fromBranch');
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [warehouse, setWarehouse] = useState<WarehouseDetail | null>(null);
  const [tab, setTab] = useState<Tab>('products');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    branchId: '',
    country: '',
    city: '',
    address: '',
    contactPerson: '',
    phone: '',
    notes: '',
    isActive: true,
  });
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [receivings, setReceivings] = useState<ReceivingRow[]>([]);
  const [distribution, setDistribution] = useState<DistributionRow[]>([]);
  const [error, setError] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inspectionView = canInspectAnyBranchWarehouse(user);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'products', label: t('branchWarehouse.tabs.products') },
    { id: 'stock', label: t('branchWarehouse.tabs.stock') },
    ...(inspectionView
      ? []
      : ([
          { id: 'movements', label: t('branchWarehouse.tabs.movements') },
          { id: 'inventory', label: t('branchWarehouse.tabs.inventory') },
        ] as Array<{ id: Tab; label: string }>)),
    { id: 'receiving', label: t('branchWarehouse.tabs.receiving') },
    { id: 'distribution', label: t('branchWarehouse.tabs.distributionHistory') },
  ];

  useEffect(() => {
    void load();
  }, [params.id, tab]);

  useEffect(() => {
    if (inspectionView && (tab === 'movements' || tab === 'inventory')) {
      setTab('products');
    }
  }, [inspectionView, tab]);

  async function load() {
    try {
      const [me, detail] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<WarehouseDetail>(`/branch-warehouses/${params.id}`),
      ]);
      setUser(me);
      setWarehouse(detail);
      setForm({
        name: detail.name,
        code: detail.code,
        branchId: detail.branchId ?? '',
        country: detail.country ?? '',
        city: detail.city ?? '',
        address: detail.address ?? '',
        contactPerson: detail.contactPerson ?? '',
        phone: detail.phone ?? '',
        notes: detail.notes ?? '',
        isActive: detail.isActive,
      });
      if (tab === 'products') setProducts(await apiFetch(`/branch-warehouses/${params.id}/products`));
      if (tab === 'stock') setStock(await apiFetch(`/branch-warehouses/${params.id}/inventory`));
      if (tab === 'movements') setMovements(await apiFetch(`/branch-warehouses/${params.id}/movements`));
      if (tab === 'inventory') setInventory(await apiFetch(`/branch-warehouses/${params.id}/inventory-history`));
      if (tab === 'receiving') setReceivings(await apiFetch(`/branch-warehouses/${params.id}/receivings`));
      if (tab === 'distribution') setDistribution(await apiFetch(`/branch-warehouses/${params.id}/distribution`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function openEdit() {
    setEditing(true);
    if (branches.length === 0) {
      try {
        const branchList = await apiFetch<BranchOption[]>('/branches');
        setBranches(branchList);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch(`/branch-warehouses/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      window.localStorage.setItem('emotors_warehouse_success', t('branchWarehouse.updatedSuccess'));
      router.push('/branch-warehouses');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const canEdit = canEditWarehouseInfo(user) && warehouse?.permissions?.canEdit !== false;
  const canDelete = canDeleteBranchWarehouse(user);
  const branchContextId = fromBranchId ?? warehouse?.branchId ?? null;

  async function confirmDeleteWarehouse() {
    setDeleting(true);
    setError('');
    try {
      const result = await apiFetch<{ success: boolean; message?: string }>(
        `/branch-warehouses/${params.id}`,
        { method: 'DELETE', body: JSON.stringify({}) },
      );
      if (!result.success) {
        throw new Error(t('common.error'));
      }
      window.localStorage.setItem(
        'emotors_warehouse_success',
        result.message ?? t('branchWarehouse.deletedSuccess'),
      );
      setDeleteModalOpen(false);
      router.push('/branch-warehouses');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message.includes('Internal Server Error') ? t('common.error') : message);
    } finally {
      setDeleting(false);
    }
  }

  if (!warehouse && !error) {
    return (
      <ProtectedShell>
        <p className="p-6">{t('common.loading')}</p>
      </ProtectedShell>
    );
  }

  if (!warehouse) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 p-6 text-sm text-red-700">{error || t('common.error')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        {branchContextId && inspectionView ? (
          <nav className="text-sm text-slate-500">
            <Link href="/branches" className="font-semibold text-blue-600 hover:underline">
              {t('nav.branches')}
            </Link>
            <span className="mx-2">→</span>
            <Link href={`/branches/${branchContextId}`} className="font-semibold text-blue-600 hover:underline">
              {warehouse.branchName ?? t('branchWarehouse.branchName')}
            </Link>
            <span className="mx-2">→</span>
            <span className="font-semibold text-slate-700">{t('branchWarehouse.warehouseLabel')}</span>
          </nav>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchWarehouse.title')}</p>
            {inspectionView ? (
              <>
                <p className="mt-1 text-sm text-slate-600">
                  {t('branchWarehouse.branchName')}: <span className="font-semibold text-slate-900">{warehouse.branchName ?? '—'}</span>
                </p>
                <h2 className="text-3xl font-bold text-slate-950">
                  {t('branchWarehouse.warehouseLabel')}: {warehouse.name}
                </h2>
              </>
            ) : (
              <h2 className="text-3xl font-bold text-slate-950">{warehouse.branchName ?? warehouse.name}</h2>
            )}
            <p className="text-sm text-slate-500">
              {warehouse.code} · {warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {branchContextId && inspectionView ? (
              <Link
                href={`/branches/${branchContextId}`}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                {t('branchWarehouse.backToBranch')}
              </Link>
            ) : (
              <Link href="/branch-warehouses" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
                {t('common.back')}
              </Link>
            )}
            {!inspectionView ? (
              <>
                <button
                  type="button"
                  onClick={() => setTab('movements')}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  {t('branchWarehouse.tabs.movements')}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('inventory')}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  {t('branchWarehouse.tabs.inventory')}
                </button>
              </>
            ) : null}
            {canEdit && !editing ? (
              <button
                type="button"
                onClick={() => void openEdit()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('branchWarehouse.editWarehouse')}
              </button>
            ) : null}
            {canDelete && !editing ? (
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
              >
                {t('branchWarehouse.deleteWarehouse')}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label={t('branchWarehouse.totalProducts')} value={String(warehouse.totalSkuCount)} />
          <SummaryCard label={t('branchWarehouse.totalUnits')} value={String(warehouse.totalProductQuantity)} />
          <SummaryCard label={t('branchWarehouse.reserved')} value={String(warehouse.reservedQuantity)} />
          <SummaryCard label={t('branchWarehouse.available')} value={String(warehouse.availableQuantity)} />
          <SummaryCard label={t('branchWarehouse.inventoryValue')} value={`${warehouse.totalStockValueKgs.toLocaleString()} KGS`} />
          <SummaryCard
            label={t('branchWarehouse.lastMovement')}
            value={warehouse.lastMovementAt ? new Date(warehouse.lastMovementAt).toLocaleDateString() : '—'}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCard
            label={t('branchWarehouse.lastInventory')}
            value={warehouse.lastInventoryDate ? new Date(warehouse.lastInventoryDate).toLocaleDateString() : '—'}
          />
        </div>

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          {editing ? (
            <form onSubmit={save} className="contents">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchWarehouse.branchName')}</span>
                <select
                  value={form.branchId}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  required
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </label>
              <EditableField label={t('warehouse.name')} value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              <EditableField label={t('warehouse.code')} value={form.code} onChange={(value) => setForm({ ...form, code: value })} />
              <EditableField label={t('hqWarehouse.city')} value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
              <EditableField label={t('warehouse.region')} value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
              <EditableField label={t('warehouse.address')} value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
              <EditableField label={t('hqWarehouse.contactPerson')} value={form.contactPerson} onChange={(value) => setForm({ ...form, contactPerson: value })} />
              <EditableField label={t('hqWarehouse.phone')} value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('common.status')}</span>
                <select
                  value={form.isActive ? 'ACTIVE' : 'INACTIVE'}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === 'ACTIVE' })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="ACTIVE">{t('warehouse.active')}</option>
                  <option value="INACTIVE">{t('warehouse.inactive')}</option>
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.notes')}</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  rows={3}
                />
              </label>
              <div className="flex gap-3 md:col-span-2">
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('common.save')}</button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setForm({
                      name: warehouse.name,
                      code: warehouse.code,
                      branchId: warehouse.branchId ?? '',
                      country: warehouse.country ?? '',
                      city: warehouse.city ?? '',
                      address: warehouse.address ?? '',
                      contactPerson: warehouse.contactPerson ?? '',
                      phone: warehouse.phone ?? '',
                      notes: warehouse.notes ?? '',
                      isActive: warehouse.isActive,
                    });
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <>
              <ReadOnlyField label={t('branchWarehouse.branchName')} value={warehouse.branchName ?? '—'} />
              <ReadOnlyField label={t('warehouse.name')} value={warehouse.name} />
              <ReadOnlyField label={t('warehouse.code')} value={warehouse.code} />
              <ReadOnlyField label={t('hqWarehouse.city')} value={warehouse.city ?? '—'} />
              <ReadOnlyField label={t('warehouse.region')} value={warehouse.country ?? 'Kyrgyzstan'} />
              <ReadOnlyField label={t('warehouse.address')} value={warehouse.address ?? '—'} />
              <ReadOnlyField label={t('hqWarehouse.contactPerson')} value={warehouse.contactPerson ?? '—'} />
              <ReadOnlyField label={t('hqWarehouse.phone')} value={warehouse.phone ?? '—'} />
              <ReadOnlyField label={t('common.status')} value={warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')} />
              <ReadOnlyField label={t('hqWarehouse.notes')} value={warehouse.notes ?? '—'} className="md:col-span-2" />
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item.id ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'products' ? (
          <SimpleTable
            headers={[
              t('inventory.products'),
              t('branchWarehouse.productCode'),
              t('inventory.categories'),
              t('branchWarehouse.onHand'),
              t('branchWarehouse.reserved'),
              t('branchWarehouse.available'),
              t('stockMovement.unitCost'),
              t('branchWarehouse.lineInventoryValue'),
              t('branchWarehouse.lastMovement'),
              t('common.actions'),
            ]}
            rows={products.map((row) => [
              row.product.name,
              row.sku,
              row.categoryName ?? '—',
              row.quantity,
              row.reservedQuantity,
              row.availableQuantity,
              row.landedCostKgs != null ? `${row.landedCostKgs.toLocaleString()} KGS` : '—',
              row.totalValueKgs != null ? `${row.totalValueKgs.toLocaleString()} KGS` : '—',
              row.lastMovementAt ? new Date(row.lastMovementAt).toLocaleDateString() : '—',
              t('common.open'),
            ])}
            emptyLabel={t('branchWarehouse.noProducts')}
          />
        ) : null}

        {tab === 'stock' ? (
          <SimpleTable
            headers={[
              t('inventory.products'),
              'SKU',
              t('hqWarehouse.quantity'),
              t('hqWarehouse.reserved'),
              t('hqWarehouse.available'),
              t('hqWarehouse.landedCost'),
              t('hqWarehouse.lastReceiving'),
            ]}
            rows={stock.map((row) => [
              row.product.name,
              row.sku,
              row.quantity,
              row.reservedQuantity,
              row.availableQuantity,
              row.landedCostKgs,
              row.lastReceivingAt ? new Date(row.lastReceivingAt).toLocaleDateString() : '—',
            ])}
            emptyLabel={t('inventoryCount.noHistory')}
          />
        ) : null}

        {tab === 'movements' ? (
          <SimpleTable
            headers={[
              t('common.date'),
              t('stockMovement.product'),
              t('stockMovement.type'),
              t('stockMovement.quantity'),
              t('stockMovement.warehouse'),
              t('users.title'),
              t('stockMovement.note'),
            ]}
            rows={movements.map((row) => [
              new Date(row.createdAt).toLocaleString(),
              `${row.product?.sku ?? ''} · ${row.product?.name ?? ''}`,
              row.type,
              row.quantity,
              row.referenceType ? `${row.referenceType}${row.referenceId ? ` #${row.referenceId.slice(-6)}` : ''}` : row.warehouse?.name ?? '—',
              row.createdBy?.fullName ?? '—',
              row.note ?? '—',
            ])}
            emptyLabel={t('branchWarehouse.noMovements')}
          />
        ) : null}

        {tab === 'inventory' ? (
          <SimpleTable
            headers={[
              '#',
              t('common.date'),
              t('users.title'),
              t('common.status'),
              t('inventoryCount.shortages'),
              t('inventoryCount.overages'),
              t('inventoryCount.totalDifferenceValue'),
              t('branchWarehouse.approvedBy'),
              t('branchWarehouse.approvalDate'),
              t('common.actions'),
            ]}
            rows={inventory.map((row) => [
              row.sessionNumber,
              new Date(row.createdAt).toLocaleDateString(),
              row.createdBy?.fullName ?? '—',
              translateStatus(t, row.status, 'inventoryCount'),
              `${row.shortageValueKgs.toLocaleString()} KGS`,
              `${row.surplusValueKgs.toLocaleString()} KGS`,
              `${row.netDifferenceValueKgs.toLocaleString()} KGS`,
              row.approvedBy?.fullName ?? '—',
              row.approvedAt ? new Date(row.approvedAt).toLocaleDateString() : '—',
              t('common.open'),
            ])}
            rowLinks={inventory.map((row) => `/inventory/count/${row.id}`)}
            emptyLabel={t('branchWarehouse.noInventoryCounts')}
          />
        ) : null}

        {tab === 'receiving' ? (
          <SimpleTable
            headers={['#', t('common.date'), t('hqWarehouse.items'), t('distribution.orders')]}
            rows={receivings.map((row) => [
              row.receivingNumber,
              new Date(row.receivedAt).toLocaleString(),
              row.items?.length ?? 0,
              row.distributionOrder?.orderNumber ?? '—',
            ])}
            emptyLabel={t('inventoryCount.noHistory')}
          />
        ) : null}

        {tab === 'distribution' ? (
          <SimpleTable
            headers={['#', t('common.branch'), t('warehouse.name'), t('common.status'), t('common.date')]}
            rows={distribution.map((row) => [
              row.orderNumber,
              row.branch?.name ?? '—',
              row.sourceWarehouse?.name ?? '—',
              row.status,
              new Date(row.createdAt).toLocaleDateString(),
            ])}
            emptyLabel={t('inventoryCount.noHistory')}
          />
        ) : null}
      </section>
      <BranchWarehouseDeleteConfirmModal
        open={deleteModalOpen}
        warehouseName={warehouse.name}
        branchName={warehouse.branchName ?? '—'}
        loading={deleting}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => void confirmDeleteWarehouse()}
      />
    </ProtectedShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ReadOnlyField({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyLabel,
  rowLinks,
}: {
  headers: string[];
  rows: (string | number)[][];
  emptyLabel: string;
  rowLinks?: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-500">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3">
                    {rowLinks?.[index] && cellIndex === row.length - 1 ? (
                      <Link href={rowLinks[index]} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        {cell}
                      </Link>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
