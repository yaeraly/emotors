'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { canCreateProcurementOrder, canDeleteProcurementOrder } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  createdAt?: string;
  status: string;
  totalYuan: string | number;
  totalCostKgs: string | number;
  supplier?: { name: string };
  factory?: { name: string } | null;
  hqWarehouse?: { name: string };
  estimatedArrivalDate?: string | null;
};

export default function ProcurementOrdersPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProcurementOrder | null>(null);
  const [deleteRequireReason, setDeleteRequireReason] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    return apiFetch<ProcurementOrder[]>('/procurement/orders')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    void load();
    void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
  }, [load]);

  const canDelete = canDeleteProcurementOrder(currentUser);

  function openDelete(order: ProcurementOrder) {
    setDeleteTarget(order);
    setDeleteRequireReason(order.status !== 'DRAFT');
    setError('');
  }

  async function confirmDelete(reason?: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const result = await apiFetch<{ archived?: boolean }>(`/procurement/orders/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setSuccess(result.archived ? t('procurement.orders.archivedSuccess') : t('procurement.orders.deletedSuccess'));
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

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('procurement.orders.title')}</h2>
          </div>
          {canCreateProcurementOrder(currentUser) ? (
            <Link href="/procurement/orders/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">{t('procurement.orders.new')}</Link>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t('procurement.orders.orderDate')}</th><th className="px-4 py-3">{t('procurement.orders.supplier')}</th><th className="px-4 py-3">{t('procurement.orders.factory')}</th><th className="px-4 py-3">{t('procurement.orders.status')}</th><th className="px-4 py-3">{t('procurement.orders.totalYuan')}</th><th className="px-4 py-3">{t('procurement.orders.totalCostKgs')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-bold">{order.createdAt ? formatOrderDate(order.createdAt) : '-'}</td>
                  <td className="px-4 py-3">{order.supplier?.name ?? '-'}</td>
                  <td className="px-4 py-3">{order.factory?.name ?? '-'}</td>
                  <td className="px-4 py-3">{order.status}</td>
                  <td className="px-4 py-3">¥{Number(order.totalYuan ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3">{formatKgs(order.totalCostKgs)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/procurement/orders/${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link>
                      {canDelete ? (
                        <button type="button" onClick={() => openDelete(order)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
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

function formatOrderDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
