'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { canAssignHqWarehouseManager, canDeleteHqGoodsReceiving, canDeleteHqWarehouse, canManageHqWarehouse } from '@/lib/rbac';
import type { User, Warehouse } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

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

type ManagerAssignment = {
  id: string;
  userId: string;
  warehouseId: string;
  assignedAt: string;
  user: { id: string; fullName: string; email: string };
};

export default function HqWarehouseDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [receivings, setReceivings] = useState<ReceivingRow[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ReceivingRow | null>(null);
  const [deleteWarehouseOpen, setDeleteWarehouseOpen] = useState(false);
  const [deleteWarehouseRequireReason, setDeleteWarehouseRequireReason] = useState(false);
  const [deletingWarehouse, setDeletingWarehouse] = useState(false);
  const [deletingReceiving, setDeletingReceiving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', country: '', city: '', address: '', contactPerson: '', phone: '', notes: '' });
  const [managers, setManagers] = useState<ManagerAssignment[]>([]);
  const [managerCandidates, setManagerCandidates] = useState<User[]>([]);
  const [assignUserId, setAssignUserId] = useState('');

  useEffect(() => {
    void load();
  }, [params.id, tab]);

  async function loadManagers(me: User) {
    if (!canAssignHqWarehouseManager(me)) {
      setManagers([]);
      setManagerCandidates([]);
      return;
    }
    const [assignmentResult, usersResult] = await Promise.all([
      apiFetch<ManagerAssignment[]>(`/hq-warehouses/${params.id}/managers`),
      apiFetch<User[]>('/users?role=WAREHOUSE_MANAGER'),
    ]);
    setManagers(assignmentResult);
    setManagerCandidates(usersResult);
    setAssignUserId(usersResult[0]?.id ?? '');
  }

  async function load() {
    try {
      const me = await apiFetch<User>('/auth/me');
      setUser(me);
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
      });
      if (tab === 'inventory') setInventory(await apiFetch(`/hq-warehouses/${params.id}/inventory`));
      if (tab === 'receivings') setReceivings(await apiFetch(`/hq-warehouses/${params.id}/receivings`));
      if (tab === 'transfers') setTransfers(await apiFetch(`/hq-warehouses/${params.id}/transfers`));
      if (tab === 'history') setHistory(await apiFetch(`/hq-warehouses/${params.id}/history`));
      if (tab === 'details') await loadManagers(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiFetch(`/hq-warehouses/${params.id}`, { method: 'PUT', body: JSON.stringify(form) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function assignManager() {
    if (!assignUserId) return;
    setError('');
    try {
      await apiFetch(`/hq-warehouses/${params.id}/managers`, {
        method: 'POST',
        body: JSON.stringify({ userId: assignUserId }),
      });
      if (user) await loadManagers(user);
      setSuccess(t('common.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function unassignManager(targetUserId: string) {
    setError('');
    try {
      await apiFetch(`/hq-warehouses/${params.id}/managers/${targetUserId}`, { method: 'DELETE' });
      if (user) await loadManagers(user);
      setSuccess(t('common.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deactivate() {
    if (!confirm(t('hqWarehouse.deactivateConfirm'))) return;
    try {
      await apiFetch(`/hq-warehouses/${params.id}/deactivate`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
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
      setSuccess(result.archived ? t('hqWarehouse.archivedInstead') : t('hqWarehouse.deletedSuccess'));
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
      setError(message);
    } finally {
      setDeletingWarehouse(false);
    }
  }

  async function confirmDeleteReceiving(reason?: string) {
    if (!deleteTarget) return;
    setDeletingReceiving(true);
    setError('');
    setSuccess('');
    try {
      const result = await apiFetch<{ archived?: boolean; deleted?: boolean; message?: string }>(
        `/hq-warehouses/${params.id}/receivings/${deleteTarget.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        },
      );
      if (result.archived) {
        setSuccess(t('hqWarehouse.receiving.archivedMessage'));
      } else {
        setSuccess(t('hqWarehouse.receiving.deletedSuccess'));
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeletingReceiving(false);
    }
  }

  const canDeleteReceiving = canDeleteHqGoodsReceiving(user);
  const canDeleteWarehouse = canDeleteHqWarehouse(user);

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
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/hq-warehouses" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{t('common.back')}</Link>
            {canDeleteWarehouse ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteWarehouseOpen(true);
                  setDeleteWarehouseRequireReason(false);
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
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <div className="flex flex-wrap gap-2">
          {(['details', 'inventory', 'receivings', 'transfers', 'history'] as Tab[]).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700'}`}>
              {t(`hqWarehouse.tab.${item}`)}
            </button>
          ))}
        </div>

        {tab === 'details' ? (
          <form onSubmit={save} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <Field label={t('warehouse.name')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} disabled={!canManageHqWarehouse(user)} />
            <Field label={t('warehouse.code')} value={form.code} onChange={(v) => setForm({ ...form, code: v })} disabled={!canManageHqWarehouse(user)} />
            <Field label={t('hqWarehouse.country')} value={form.country} onChange={(v) => setForm({ ...form, country: v })} disabled={!canManageHqWarehouse(user)} />
            <Field label={t('hqWarehouse.city')} value={form.city} onChange={(v) => setForm({ ...form, city: v })} disabled={!canManageHqWarehouse(user)} />
            <Field label={t('warehouse.address')} value={form.address} onChange={(v) => setForm({ ...form, address: v })} disabled={!canManageHqWarehouse(user)} className="md:col-span-2" />
            <Field label={t('hqWarehouse.contactPerson')} value={form.contactPerson} onChange={(v) => setForm({ ...form, contactPerson: v })} disabled={!canManageHqWarehouse(user)} />
            <Field label={t('hqWarehouse.phone')} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} disabled={!canManageHqWarehouse(user)} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.notes')}</span>
              <textarea value={form.notes} disabled={!canManageHqWarehouse(user)} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={3} />
            </label>
            {canManageHqWarehouse(user) ? (
              <div className="flex gap-3 md:col-span-2">
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">{t('common.save')}</button>
                {warehouse.isActive ? <button type="button" onClick={() => void deactivate()} className="rounded-xl border border-red-300 px-4 py-3 font-semibold text-red-700">{t('hqWarehouse.deactivate')}</button> : null}
              </div>
            ) : null}
          </form>
        ) : null}

        {tab === 'details' && canAssignHqWarehouseManager(user) ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('hqWarehouse.managers')}</h3>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="text-sm font-semibold text-slate-700">{t('hqWarehouse.assignManager')}</span>
                <select
                  value={assignUserId}
                  onChange={(event) => setAssignUserId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {managerCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.fullName} ({candidate.email})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void assignManager()}
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
              >
                {t('hqWarehouse.assignManager')}
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {managers.length === 0 ? (
                <p className="text-sm text-slate-500">{t('hqWarehouse.noManagers')}</p>
              ) : (
                managers.map((assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{assignment.user.fullName}</p>
                      <p className="text-slate-500">{assignment.user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void unassignManager(assignment.userId)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {tab === 'inventory' ? <SimpleTable headers={[t('inventory.products'), 'SKU', t('hqWarehouse.quantity'), t('hqWarehouse.reserved'), t('hqWarehouse.available'), t('hqWarehouse.landedCost'), t('hqWarehouse.lastReceiving')]} rows={inventory.map((row) => [row.product.name, row.sku, row.quantity, row.reservedQuantity, row.availableQuantity, row.landedCostKgs, row.lastReceivingAt ? new Date(row.lastReceivingAt).toLocaleDateString() : '—'])} /> : null}
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
                              setSuccess('');
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
      <DeleteConfirmModal
        open={deleteWarehouseOpen}
        title={t('common.deleteConfirmTitle')}
        message={t('common.deleteConfirmMessage')}
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
