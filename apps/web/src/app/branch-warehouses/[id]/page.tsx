'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { WarehouseTopNav } from '@/components/WarehouseTopNav';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type Tab = 'products' | 'stock' | 'movements' | 'inventory' | 'receiving' | 'distribution';

type WarehouseDetail = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
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
};

type ProductRow = {
  id: string;
  sku: string;
  product: { name: string };
  categoryName?: string | null;
  supplierName?: string | null;
  quantity: number;
  sellingPriceKgs: number;
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
  product?: { sku: string; name: string };
  createdBy?: { fullName: string };
};

type InventoryRow = {
  id: string;
  sessionNumber: string;
  inventoryType: string;
  status: string;
  createdAt: string;
  createdBy?: { fullName: string };
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
  const { t } = useTranslation();
  const [warehouse, setWarehouse] = useState<WarehouseDetail | null>(null);
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [receivings, setReceivings] = useState<ReceivingRow[]>([]);
  const [distribution, setDistribution] = useState<DistributionRow[]>([]);
  const [error, setError] = useState('');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'products', label: t('branchWarehouse.tabs.products') },
    { id: 'stock', label: t('branchWarehouse.tabs.stock') },
    { id: 'movements', label: t('branchWarehouse.tabs.movements') },
    { id: 'inventory', label: t('branchWarehouse.tabs.inventory') },
    { id: 'receiving', label: t('branchWarehouse.tabs.receiving') },
    { id: 'distribution', label: t('branchWarehouse.tabs.distributionHistory') },
  ];

  useEffect(() => {
    void load();
  }, [params.id, tab]);

  async function load() {
    try {
      const detail = await apiFetch<WarehouseDetail>(`/branch-warehouses/${params.id}`);
      setWarehouse(detail);
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

  if (!warehouse) {
    return (
      <ProtectedShell>
        <p className="p-6">{t('common.loading')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchWarehouse.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{warehouse.branchName ?? warehouse.name}</h2>
            <p className="text-sm text-slate-500">
              {warehouse.name} · {warehouse.code} · {warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')}
            </p>
          </div>
          <Link href="/branch-warehouses" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
            {t('common.back')}
          </Link>
        </div>

        <WarehouseTopNav />

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label={t('branchWarehouse.skuCount')} value={String(warehouse.totalSkuCount)} />
          <SummaryCard label={t('hqWarehouse.totalStock')} value={String(warehouse.totalProductQuantity)} />
          <SummaryCard label={t('hqWarehouse.totalValue')} value={`${warehouse.totalStockValueKgs.toLocaleString()} KGS`} />
          <SummaryCard label={t('branchWarehouse.reserved')} value={String(warehouse.reservedQuantity)} />
          <SummaryCard label={t('branchWarehouse.available')} value={String(warehouse.availableQuantity)} />
        </div>

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <ReadOnlyField label={t('branchWarehouse.branchName')} value={warehouse.branchName ?? '—'} />
          <ReadOnlyField label={t('warehouse.name')} value={warehouse.name} />
          <ReadOnlyField label={t('warehouse.code')} value={warehouse.code} />
          <ReadOnlyField label={t('hqWarehouse.city')} value={warehouse.city ?? '—'} />
          <ReadOnlyField label={t('warehouse.region')} value={warehouse.country ?? 'Kyrgyzstan'} />
          <ReadOnlyField label={t('warehouse.address')} value={warehouse.address ?? '—'} />
          <ReadOnlyField label={t('hqWarehouse.contactPerson')} value={warehouse.contactPerson ?? '—'} />
          <ReadOnlyField label={t('hqWarehouse.phone')} value={warehouse.phone ?? '—'} />
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
              'SKU',
              t('inventory.categories'),
              t('procurement.suppliers.title'),
              t('hqWarehouse.quantity'),
              t('inventory.sellingPriceKgs'),
              t('common.status'),
            ]}
            rows={products.map((row) => [
              row.product.name,
              row.sku,
              row.categoryName ?? '—',
              row.supplierName ?? '—',
              row.quantity,
              row.sellingPriceKgs,
              row.status,
            ])}
            emptyLabel={t('inventoryCount.noHistory')}
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
              t('users.title'),
            ]}
            rows={movements.map((row) => [
              new Date(row.createdAt).toLocaleString(),
              `${row.product?.sku ?? ''} · ${row.product?.name ?? ''}`,
              row.type,
              row.quantity,
              row.createdBy?.fullName ?? '—',
            ])}
            emptyLabel={t('inventoryCount.noHistory')}
          />
        ) : null}

        {tab === 'inventory' ? (
          <SimpleTable
            headers={[
              '#',
              t('inventoryCount.inventoryType'),
              t('common.status'),
              t('common.date'),
              t('users.title'),
            ]}
            rows={inventory.map((row) => [
              row.sessionNumber,
              row.inventoryType,
              row.status,
              new Date(row.createdAt).toLocaleDateString(),
              row.createdBy?.fullName ?? '—',
            ])}
            emptyLabel={t('inventoryCount.noHistory')}
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{value}</div>
    </label>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: (string | number)[][];
  emptyLabel: string;
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
                    {cell}
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
