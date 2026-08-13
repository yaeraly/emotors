'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { PermanentDeleteConfirmModal } from '@/components/PermanentDeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { formatHqWarehouseContactPerson } from '@/lib/hq-warehouse';
import { canDeleteHqGoodsReceiving, canDeleteHqWarehouse, canEditWarehouseInfo, canManageHqWarehouse, hasFullAccess, isWarehouseManagerUser } from '@/lib/rbac';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type Tab = 'details' | 'inventory' | 'receivings' | 'transfers' | 'history';

type InventoryRow = {
  id: string;
  sku: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  averageCostKgs: number;
  landedCostKgs: number;
  totalValueKgs: number;
  lastReceivingAt?: string | null;
  product: { name: string };
};

type ReceivingRow = {
  id: string;
  receivingNumber: string;
  receivedAt: string;
  items?: Array<{ id: string }>;
  procurementOrder?: { id: string; orderNumber: string };
};

export default function HqWarehouseDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [warehouse, setWarehouse] = useState<(Warehouse & { hasDeleteHistory?: boolean }) | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [receivings, setReceivings] = useState<ReceivingRow[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ReceivingRow | null>(null);
  const [deleteWarehouseOpen, setDeleteWarehouseOpen] = useState(false);
  const [deleteWarehouseRequireReason, setDeleteWarehouseRequireReason] = useState(false);
  const [deletingWarehouse, setDeletingWarehouse] = useState(false);
  const [deletingReceiving, setDeletingReceiving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', country: '', city: '', address: '', contactPerson: '', phone: '', notes: '', isActive: true });

  useEffect(() => {
    void load();
  }, [params.id, tab]);

  async function load() {
    try {
      const me = await apiFetch<User>('/auth/me');
      setUser(me);
      if (isWarehouseManagerUser(me) && !hasFullAccess(me)) {
        setTab((current) => (current === 'details' || current === 'history' ? 'inventory' : current));
      }
      const detail = await apiFetch<Warehouse & { inventoryCount: number; pendingTransfers: number }>(`/hq-warehouses/${params.id}`);
      setWarehouse(detail);
      setForm({
        name: detail.name,
        code: detail.code,
        country: (detail as any).country ?? '',
        city: (detail as any).city ?? '',
        address: detail.address ?? '',
        contactPerson: (detail as any).contactPerson ?? '',
        phone: (detail as any).phone ?? '',
        notes: (detail as any).notes ?? '',
        isActive: detail.isActive,
      });
      if (tab === 'inventory') setInventory(await apiFetch(`/hq-warehouses/${params.id}/inventory`));
      if (tab === 'receivings') setReceivings(await apiFetch(`/hq-warehouses/${params.id}/receivings`));
      if (tab === 'transfers') setTransfers(await apiFetch(`/hq-warehouses/${params.id}/transfers`));
      if (tab === 'history') setHistory(await apiFetch(`/hq-warehouses/${params.id}/history`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch(`/hq-warehouses/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          country: form.country,
          city: form.city,
          address: form.address,
          contactPerson: form.contactPerson,
          phone: form.phone,
          notes: form.notes,
          isActive: form.isActive,
        }),
      });
      window.localStorage.setItem('emotors_warehouse_success', t('hqWarehouse.infoUpdatedSuccess'));
      router.push('/hq-warehouses');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function resetFormFromWarehouse() {
    if (!warehouse) return;
    setForm({
      name: warehouse.name,
      code: warehouse.code,
      country: (warehouse as any).country ?? '',
      city: (warehouse as any).city ?? '',
      address: warehouse.address ?? '',
      contactPerson: (warehouse as any).contactPerson ?? '',
      phone: (warehouse as any).phone ?? '',
      notes: (warehouse as any).notes ?? '',
      isActive: warehouse.isActive,
    });
  }

  async function deactivate() {
    if (!confirm(t('hqWarehouse.deactivateConfirm'))) return;
    try {
      await apiFetch(`/hq-warehouses/${params.id}/deactivate`, { method: 'POST' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDeleteWarehouse(reason?: string) {
    setDeletingWarehouse(true);
    setError('');
    try {
      const result = await apiFetch<{ archived?: boolean }>(`/hq-warehouses/${params.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      toast.success(result.archived ? t('hqWarehouse.archivedInstead') : t('hqWarehouse.deletedSuccess'));
      setDeleteWarehouseOpen(false);
      if (!result.archived) {
        router.push('/hq-warehouses');
        return;
      }
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('reason is required')) {
        setDeleteWarehouseRequireReason(true);
      }
      toast.error(message);
    } finally {
      setDeletingWarehouse(false);
    }
  }

  async function confirmDeleteReceiving(reason?: string) {
    if (!deleteTarget) return;
    setDeletingReceiving(true);
    setError('');
    /* toast clear */ void 0;
    try {
      const result = await apiFetch<{ archived?: boolean; deleted?: boolean; message?: string }>(
        `/hq-warehouses/${params.id}/receivings/${deleteTarget.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        },
      );
      if (result.archived) {
        toast.success(t('hqWarehouse.receiving.archivedMessage'));
      } else {
        toast.success(t('hqWarehouse.receiving.deletedSuccess'));
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeletingReceiving(false);
    }
  }

  const canDeleteReceiving = canDeleteHqGoodsReceiving(user);
  const canDeleteWarehouse = canDeleteHqWarehouse(user);
  const canEditInfo = canEditWarehouseInfo(user);
  const canManageWarehouse = canManageHqWarehouse(user);
  const isWmScopedView = isWarehouseManagerUser(user) && !hasFullAccess(user);
  const visibleTabs: Tab[] = isWmScopedView
    ? ['inventory', 'transfers']
    : ['details', 'inventory', 'receivings', 'transfers', 'history'];

  useEffect(() => {
    if (isWmScopedView && tab === 'receivings') {
      setTab('inventory');
    }
  }, [isWmScopedView, tab]);

  if (!warehouse) {
    return <ProtectedShell><p className="p-6">{t('common.loading')}</p></ProtectedShell>;
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('hqWarehouse.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{warehouse.name}</h2>
            <p className="text-sm text-slate-500">{warehouse.code} · {warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')}</p>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">{t('hqWarehouse.contactPerson')}:</span>{' '}
              {formatHqWarehouseContactPerson(warehouse, t)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/hq-warehouses" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{t('common.back')}</Link>
            {canEditInfo && tab === 'details' && !editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('hqWarehouse.editWarehouse')}
              </button>
            ) : null}
            {canDeleteWarehouse ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteWarehouseOpen(true);
                  setDeleteWarehouseRequireReason(Boolean(warehouse?.hasDeleteHistory));
                  setError('');
                }}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700"
              >
                {t('common.delete')}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700'}`}>
              {t(`hqWarehouse.tab.${item}`)}
            </button>
          ))}
        </div>

        {isWmScopedView ? (
          <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <ReadOnlyField label={t('warehouse.name')} value={warehouse.name} />
            <ReadOnlyField label={t('warehouse.code')} value={warehouse.code} />
            <ReadOnlyField label={t('hqWarehouse.country')} value={(warehouse as any).country ?? '—'} />
            <ReadOnlyField label={t('hqWarehouse.city')} value={(warehouse as any).city ?? '—'} />
            <ReadOnlyField label={t('warehouse.address')} value={warehouse.address ?? '—'} className="md:col-span-2" />
            <ReadOnlyField label={t('hqWarehouse.contactPerson')} value={(warehouse as any).contactPerson ?? '—'} />
            <ReadOnlyField label={t('hqWarehouse.phone')} value={(warehouse as any).phone ?? '—'} />
            <ReadOnlyField label={t('common.status')} value={warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')} />
          </div>
        ) : null}

        {!isWmScopedView && tab === 'details' ? (
          editing ? (
            <form onSubmit={save} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
              <Field label={t('warehouse.name')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label={t('warehouse.code')} value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
              <Field label={t('hqWarehouse.country')} value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
              <Field label={t('hqWarehouse.city')} value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label={t('warehouse.address')} value={form.address} onChange={(v) => setForm({ ...form, address: v })} className="md:col-span-2" />
              <Field label={t('hqWarehouse.contactPerson')} value={form.contactPerson} onChange={(v) => setForm({ ...form, contactPerson: v })} />
              <Field label={t('hqWarehouse.phone')} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
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
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={3} />
              </label>
              <div className="flex gap-3 md:col-span-2">
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('common.save')}</button>
                <button
                  type="button"
                  onClick={() => {
                    resetFormFromWarehouse();
                    setEditing(false);
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
              <ReadOnlyField label={t('warehouse.name')} value={warehouse.name} />
              <ReadOnlyField label={t('warehouse.code')} value={warehouse.code} />
              <ReadOnlyField label={t('hqWarehouse.country')} value={(warehouse as any).country ?? '—'} />
              <ReadOnlyField label={t('hqWarehouse.city')} value={(warehouse as any).city ?? '—'} />
              <ReadOnlyField label={t('warehouse.address')} value={warehouse.address ?? '—'} className="md:col-span-2" />
              <ReadOnlyField label={t('hqWarehouse.contactPerson')} value={(warehouse as any).contactPerson ?? '—'} />
              <ReadOnlyField label={t('hqWarehouse.phone')} value={(warehouse as any).phone ?? '—'} />
              <ReadOnlyField label={t('common.status')} value={warehouse.isActive ? t('warehouse.active') : t('warehouse.inactive')} />
              <ReadOnlyField label={t('hqWarehouse.notes')} value={(warehouse as any).notes ?? '—'} className="md:col-span-2" />
              {canManageWarehouse && warehouse.isActive ? (
                <div className="md:col-span-2">
                  <button type="button" onClick={() => void deactivate()} className="rounded-xl border border-red-300 px-4 py-3 font-semibold text-red-700">{t('hqWarehouse.deactivate')}</button>
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {tab === 'inventory' ? <SimpleTable headers={[t('inventory.products'), 'SKU', t('hqWarehouse.quantity'), t('hqWarehouse.reserved'), t('hqWarehouse.available'), t('hqWarehouse.lastReceiving')]} rows={inventory.map((row) => [row.product.name, row.sku, row.quantity, row.reservedQuantity, row.availableQuantity, row.lastReceivingAt ? new Date(row.lastReceivingAt).toLocaleDateString() : '—'])} /> : null}
        {tab === 'receivings' ? (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">{t('common.date')}</th>
                  <th className="px-4 py-3">{t('hqWarehouse.items')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.title')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receivings.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-bold">{row.receivingNumber}</td>
                    <td className="px-4 py-3">{new Date(row.receivedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{row.items?.length ?? 0}</td>
                    <td className="px-4 py-3">{row.procurementOrder?.orderNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {row.procurementOrder?.id ? (
                          <Link
                            href={`/procurement/orders/${row.procurementOrder.id}`}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                          >
                            {t('common.open')}
                          </Link>
                        ) : null}
                        {canDeleteReceiving ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(row);
                              setError('');
                              /* toast clear */ void 0;
                            }}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                          >
                            {t('common.delete')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {tab === 'transfers' ? <SimpleTable headers={['#', t('common.branch'), t('common.status'), t('common.date')]} rows={transfers.map((row) => [row.orderNumber, row.branch?.name ?? '', row.status, new Date(row.createdAt).toLocaleDateString()])} /> : null}
        {tab === 'history' ? <SimpleTable headers={[t('common.date'), t('users.role'), t('hqWarehouse.action'), t('users.title')]} rows={history.map((row) => [new Date(row.timestamp).toLocaleString(), row.role ?? '', row.action, row.user?.fullName ?? '—'])} /> : null}
      </section>

      <DeleteConfirmModal
        open={!!deleteTarget}
        title={t('common.deleteConfirmTitle')}
        message={t('hqWarehouse.receiving.deleteConfirm')}
        requireReason
        loading={deletingReceiving}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteReceiving}
      />
      <PermanentDeleteConfirmModal
        open={deleteWarehouseOpen}
        requireReason={deleteWarehouseRequireReason}
        loading={deletingWarehouse}
        onClose={() => setDeleteWarehouseOpen(false)}
        onConfirm={confirmDeleteWarehouse}
      />
    </ProtectedShell>
  );
}

function Field({ label, value, onChange, disabled, className = '' }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; className?: string }) {
  return <label className={`block ${className}`}><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-50" /></label>;
}

function ReadOnlyField({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
