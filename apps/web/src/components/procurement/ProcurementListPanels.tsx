'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { apiFetch } from '@/lib/api';
import { canCreateProcurementOrder, canDeleteProcurementOrder, canManageProcurement, canManageTransportCompany, canViewTransportCompany } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = {
  id: string;
  name: string;
  companyName?: string | null;
  country?: string | null;
  city?: string | null;
  wechat?: string | null;
  phone?: string | null;
};

export function SuppliersListPanel() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
    void loadSuppliers();
  }, [t]);

  async function loadSuppliers() {
    await apiFetch<Supplier[]>('/procurement/suppliers')
      .then(setSuppliers)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  async function deleteSupplier() {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      const result = await apiFetch<{ archived?: boolean }>(`/procurement/suppliers/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });
      setSuccess(result.archived ? t('procurement.suppliers.archived') : t('procurement.suppliers.deleted'));
      setDeleteTarget(null);
      setDeleteReason('');
      await loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleting(false);
    }
  }

  const canDeleteSupplier = Boolean(currentUser && roleCodes(currentUser).includes('CEO'));

  return (
    <>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('procurement.suppliers.name')}</th>
              <th className="px-4 py-3">{t('procurement.suppliers.companyName')}</th>
              <th className="px-4 py-3">{t('procurement.suppliers.country')}</th>
              <th className="px-4 py-3">{t('procurement.suppliers.city')}</th>
              <th className="px-4 py-3">{t('procurement.suppliers.wechat')}</th>
              <th className="px-4 py-3">{t('procurement.suppliers.phone')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td className="px-4 py-3 font-bold">{supplier.name}</td>
                <td className="px-4 py-3">{supplier.companyName ?? '-'}</td>
                <td className="px-4 py-3">{supplier.country ?? '-'}</td>
                <td className="px-4 py-3">{supplier.city ?? '-'}</td>
                <td className="px-4 py-3">{supplier.wechat ?? '-'}</td>
                <td className="px-4 py-3">{supplier.phone ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/procurement/suppliers/${supplier.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                      {t('common.open')}
                    </Link>
                    {canDeleteSupplier ? (
                      <button onClick={() => setDeleteTarget(supplier)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600" type="button">
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
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-950">{t('procurement.suppliers.deleteTitle')}</h3>
            <p className="mt-2 text-sm text-slate-600">{t('procurement.suppliers.deleteMessage')}</p>
            <textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="mt-4 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" required />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold" type="button">{t('common.cancel')}</button>
              <button onClick={() => void deleteSupplier()} disabled={!deleteReason.trim() || deleting} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:bg-red-300" type="button">
                {deleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type Factory = {
  id: string;
  name: string;
  city?: string | null;
  productionCapacity?: string | null;
  supplier?: { name: string };
};

export function FactoriesListPanel() {
  const { t } = useTranslation();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    apiFetch<Factory[]>('/procurement/factories')
      .then(setFactories)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('procurement.factories.name')}</th>
              <th className="px-4 py-3">{t('procurement.factories.supplier')}</th>
              <th className="px-4 py-3">{t('procurement.factories.city')}</th>
              <th className="px-4 py-3">{t('procurement.factories.productionCapacity')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {factories.map((factory) => (
              <tr key={factory.id}>
                <td className="px-4 py-3 font-bold">{factory.name}</td>
                <td className="px-4 py-3">{factory.supplier?.name ?? '-'}</td>
                <td className="px-4 py-3">{factory.city ?? '-'}</td>
                <td className="px-4 py-3">{factory.productionCapacity ?? '-'}</td>
                <td className="px-4 py-3">
                  <Link href={`/procurement/factories/${factory.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type TransportCompany = {
  id: string;
  name: string;
  companyCode: string;
  city?: string | null;
  transportType: string;
  status: string;
};

export function TransportCompaniesListPanel() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<TransportCompany[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    void apiFetch<User>('/auth/me')
      .then((me) => {
        setCurrentUser(me);
        if (canViewTransportCompany(me)) {
          void apiFetch<TransportCompany[]>('/procurement/transport-companies')
            .then(setCompanies)
            .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
        }
      })
      .catch(() => null);
  }, [t]);

  const canManage = canManageTransportCompany(currentUser);

  return (
    <>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('procurement.transportCompanies.name')}</th>
              <th className="px-4 py-3">{t('procurement.transportCompanies.companyCode')}</th>
              <th className="px-4 py-3">{t('procurement.transportCompanies.transportType')}</th>
              <th className="px-4 py-3">{t('procurement.transportCompanies.city')}</th>
              <th className="px-4 py-3">{t('procurement.transportCompanies.status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {companies.map((company) => (
              <tr key={company.id}>
                <td className="px-4 py-3 font-semibold">{company.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{company.companyCode}</td>
                <td className="px-4 py-3">{t(`procurement.transportCompanies.type.${company.transportType}`)}</td>
                <td className="px-4 py-3">{company.city ?? '-'}</td>
                <td className="px-4 py-3">{t(`procurement.transportCompanies.statusValue.${company.status}`)}</td>
                <td className="px-4 py-3 text-right">
                  {canManage && company.status !== 'ARCHIVED' ? (
                    <Link href={`/procurement/transport-companies/${company.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
                      {t('common.edit')}
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!companies.length ? <p className="px-4 py-8 text-center text-sm text-slate-500">{t('procurement.transportCompanies.empty')}</p> : null}
      </div>
    </>
  );
}

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  createdAt?: string;
  status: string;
  totalYuan: string | number;
  totalCostKgs: string | number;
  supplier?: { name: string };
  factory?: { name: string } | null;
};

export function ProcurementOrdersListPanel() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProcurementOrder | null>(null);
  const [deleteRequireReason, setDeleteRequireReason] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    void apiFetch<ProcurementOrder[]>('/procurement/orders').then(setOrders).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
    void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
  }, [t]);

  const canDelete = canDeleteProcurementOrder(currentUser);

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
      setOrders(await apiFetch<ProcurementOrder[]>('/procurement/orders'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('reason is required')) setDeleteRequireReason(true);
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('procurement.orders.orderDate')}</th>
              <th className="px-4 py-3">{t('procurement.orders.supplier')}</th>
              <th className="px-4 py-3">{t('procurement.orders.factory')}</th>
              <th className="px-4 py-3">{t('procurement.orders.status')}</th>
              <th className="px-4 py-3">{t('procurement.orders.totalYuan')}</th>
              <th className="px-4 py-3">{t('procurement.orders.totalCostKgs')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-3 font-bold">{order.createdAt ? new Date(order.createdAt).toLocaleString('ru-RU') : '-'}</td>
                <td className="px-4 py-3">{order.supplier?.name ?? '-'}</td>
                <td className="px-4 py-3">{order.factory?.name ?? '-'}</td>
                <td className="px-4 py-3">{order.status}</td>
                <td className="px-4 py-3">¥{Number(order.totalYuan ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3">{Number(order.totalCostKgs ?? 0).toLocaleString('ru-RU')} сом</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/procurement/orders/${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link>
                    {canDelete ? (
                      <button type="button" onClick={() => { setDeleteTarget(order); setDeleteRequireReason(order.status !== 'DRAFT'); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
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
      <DeleteConfirmModal open={!!deleteTarget} title={t('common.deleteConfirmTitle')} message={t('common.deleteConfirmMessage')} requireReason={deleteRequireReason} loading={deleting} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </>
  );
}

export function useProcurementCreateAction(tab: string, user: User | null, t: (key: string) => string) {
  if (!user) return null;
  if (tab === 'suppliers' && canManageProcurement(user)) {
    return { href: '/procurement/suppliers/new', label: t('procurement.suppliers.new') };
  }
  if (tab === 'factories' && canManageProcurement(user)) {
    return { href: '/procurement/factories/new', label: t('procurement.factories.new') };
  }
  if (tab === 'transport' && canManageTransportCompany(user)) {
    return { href: '/procurement/transport-companies/new', label: t('procurement.transportCompanies.create') };
  }
  if (tab === 'orders' && canCreateProcurementOrder(user)) {
    return { href: '/procurement/orders/new', label: t('procurement.orders.new') };
  }
  return null;
}

function roleCodes(user: User) {
  return user.roles?.length ? user.roles : [user.role];
}
