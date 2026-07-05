'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canCreateProcurementOrder,
  canManageProcurement,
  canManageTransportCompany,
  canViewProcurement,
  canViewTransportCompany,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = {
  id: string;
  name: string;
  companyName?: string | null;
  country?: string | null;
  city?: string | null;
};

type Factory = {
  id: string;
  name: string;
  city?: string | null;
  supplier?: { name: string };
};

type TransportCompany = {
  id: string;
  name: string;
  companyCode: string;
  transportType: string;
  status: string;
};

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  createdAt?: string;
  status: string;
  totalYuan: string | number;
  supplier?: { name: string };
  factory?: { name: string } | null;
};

const LIST_LIMIT = 5;

export default function ProcurementPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [transportCompanies, setTransportCompanies] = useState<TransportCompany[]>([]);
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canManage = canManageProcurement(user);
  const canView = canViewProcurement(user);
  const canCreateOrder = canCreateProcurementOrder(user);
  const canManageTransport = canManageTransportCompany(user);
  const canViewTransport = canViewTransportCompany(user);

  const loadData = useCallback(async () => {
    if (!user || !canView) return;
    setError('');
    try {
      const requests: Promise<void>[] = [
        apiFetch<Supplier[]>('/procurement/suppliers').then(setSuppliers),
        apiFetch<Factory[]>('/procurement/factories').then(setFactories),
        apiFetch<ProcurementOrder[]>('/procurement/orders').then(setOrders),
      ];
      if (canViewTransport) {
        requests.push(apiFetch<TransportCompany[]>('/procurement/transport-companies').then(setTransportCompanies));
      }
      await Promise.all(requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }, [user, canView, canViewTransport, t]);

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    void apiFetch<User>('/auth/me').then(setUser).catch(() => null);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!canView) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">EMOTORS OS</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('procurement.title')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <div className="space-y-6">
          <DashboardSection
            title={t('procurement.suppliers.title')}
            newHref="/procurement/suppliers/new"
            newLabel={t('procurement.suppliers.new')}
            viewAllHref="/procurement/suppliers"
            viewAllLabel={t('procurement.dashboard.viewAll')}
            showNew={canManage}
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('procurement.suppliers.name')}</th>
                  <th className="px-4 py-3">{t('procurement.suppliers.companyName')}</th>
                  <th className="px-4 py-3">{t('procurement.suppliers.city')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.slice(0, LIST_LIMIT).map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-4 py-3 font-bold">{supplier.name}</td>
                    <td className="px-4 py-3">{supplier.companyName ?? '-'}</td>
                    <td className="px-4 py-3">{supplier.city ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/procurement/suppliers/${supplier.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {!suppliers.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">{t('procurement.dashboard.empty')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </DashboardSection>

          <DashboardSection
            title={t('procurement.factories.title')}
            newHref="/procurement/factories/new"
            newLabel={t('procurement.factories.new')}
            viewAllHref="/procurement/factories"
            viewAllLabel={t('procurement.dashboard.viewAll')}
            showNew={canManage}
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('procurement.factories.name')}</th>
                  <th className="px-4 py-3">{t('procurement.factories.supplier')}</th>
                  <th className="px-4 py-3">{t('procurement.factories.city')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {factories.slice(0, LIST_LIMIT).map((factory) => (
                  <tr key={factory.id}>
                    <td className="px-4 py-3 font-bold">{factory.name}</td>
                    <td className="px-4 py-3">{factory.supplier?.name ?? '-'}</td>
                    <td className="px-4 py-3">{factory.city ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/procurement/factories/${factory.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {!factories.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">{t('procurement.dashboard.empty')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </DashboardSection>

          {canViewTransport ? (
            <DashboardSection
              title={t('procurement.transportCompanies.title')}
              newHref="/procurement/transport-companies/new"
              newLabel={t('procurement.transportCompanies.new')}
              viewAllHref="/procurement/transport-companies"
              viewAllLabel={t('procurement.dashboard.viewAll')}
              showNew={canManageTransport}
            >
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('procurement.transportCompanies.name')}</th>
                    <th className="px-4 py-3">{t('procurement.transportCompanies.companyCode')}</th>
                    <th className="px-4 py-3">{t('procurement.transportCompanies.transportType')}</th>
                    <th className="px-4 py-3">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transportCompanies.slice(0, LIST_LIMIT).map((company) => (
                    <tr key={company.id}>
                      <td className="px-4 py-3 font-bold">{company.name}</td>
                      <td className="px-4 py-3">{company.companyCode}</td>
                      <td className="px-4 py-3">{t(`procurement.transportCompanies.type.${company.transportType}`)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/procurement/transport-companies/${company.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                          {t('common.open')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!transportCompanies.length ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">{t('procurement.dashboard.empty')}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </DashboardSection>
          ) : null}

          <DashboardSection
            title={t('procurement.orders.title')}
            newHref="/procurement/orders/new"
            newLabel={t('procurement.orders.new')}
            viewAllHref="/procurement/orders"
            viewAllLabel={t('procurement.dashboard.viewAll')}
            showNew={canCreateOrder}
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('procurement.orders.orderDate')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.supplier')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.status')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.totalYuan')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.slice(0, LIST_LIMIT).map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-bold">{order.createdAt ? formatOrderDate(order.createdAt) : '-'}</td>
                    <td className="px-4 py-3">{order.supplier?.name ?? '-'}</td>
                    <td className="px-4 py-3">{order.status}</td>
                    <td className="px-4 py-3">¥{Number(order.totalYuan ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/procurement/orders/${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {!orders.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">{t('procurement.dashboard.empty')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </DashboardSection>
        </div>
      </section>
    </ProtectedShell>
  );
}

function DashboardSection({
  title,
  newHref,
  newLabel,
  viewAllHref,
  viewAllLabel,
  showNew,
  children,
}: {
  title: string;
  newHref: string;
  newLabel: string;
  viewAllHref: string;
  viewAllLabel: string;
  showNew: boolean;
  children: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-slate-950">{title}</h3>
        {showNew ? (
          <Link href={newHref} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            <span aria-hidden>+</span>
            {newLabel}
          </Link>
        ) : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
      <div className="border-t border-slate-100 px-6 py-4">
        <Link href={viewAllHref} className="text-sm font-semibold text-blue-700 hover:text-blue-800">
          {viewAllLabel}
        </Link>
      </div>
    </article>
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
