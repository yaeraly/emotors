'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  isActive?: boolean;
};

type Factory = {
  id: string;
  isActive?: boolean;
};

type TransportCompany = {
  id: string;
  status: string;
};

type ProcurementOrder = {
  id: string;
  status: string;
};

const TERMINAL_ORDER_STATUSES = new Set(['CANCELLED', 'CLOSED', 'RECEIVED_TO_HQ_WAREHOUSE']);

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

  const supplierStats = useMemo(
    () => ({
      total: suppliers.length,
      active: suppliers.filter((item) => item.isActive !== false).length,
    }),
    [suppliers],
  );

  const factoryStats = useMemo(
    () => ({
      total: factories.length,
      active: factories.filter((item) => item.isActive !== false).length,
    }),
    [factories],
  );

  const transportStats = useMemo(
    () => ({
      total: transportCompanies.length,
      active: transportCompanies.filter((item) => item.status === 'ACTIVE').length,
    }),
    [transportCompanies],
  );

  const orderStats = useMemo(
    () => ({
      total: orders.length,
      draft: orders.filter((item) => item.status === 'DRAFT').length,
      active: orders.filter((item) => item.status !== 'DRAFT' && !TERMINAL_ORDER_STATUSES.has(item.status)).length,
    }),
    [orders],
  );

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

        <div className="grid gap-6 md:grid-cols-2">
          <ProcurementDashboardCard
            title={t('procurement.suppliers.title')}
            href="/procurement/suppliers"
            newHref="/procurement/suppliers/new"
            newLabel={t('procurement.suppliers.new')}
            showNew={canManage}
            icon={<SupplierIcon />}
            stats={[
              { label: t('procurement.dashboard.totalSuppliers'), value: supplierStats.total },
              { label: t('procurement.dashboard.activeSuppliers'), value: supplierStats.active },
            ]}
          />

          <ProcurementDashboardCard
            title={t('procurement.factories.title')}
            href="/procurement/factories"
            newHref="/procurement/factories/new"
            newLabel={t('procurement.factories.new')}
            showNew={canManage}
            icon={<FactoryIcon />}
            stats={[
              { label: t('procurement.dashboard.totalFactories'), value: factoryStats.total },
              { label: t('procurement.dashboard.activeFactories'), value: factoryStats.active },
            ]}
          />

          {canViewTransport ? (
            <ProcurementDashboardCard
              title={t('procurement.transportCompanies.title')}
              href="/procurement/transport-companies"
              newHref="/procurement/transport-companies/new"
              newLabel={t('procurement.transportCompanies.new')}
              showNew={canManageTransport}
              icon={<TransportIcon />}
              stats={[
                { label: t('procurement.dashboard.totalTransportCompanies'), value: transportStats.total },
                { label: t('procurement.dashboard.activeTransportCompanies'), value: transportStats.active },
              ]}
            />
          ) : null}

          <ProcurementDashboardCard
            title={t('procurement.orders.title')}
            href="/procurement/orders"
            newHref="/procurement/orders/new"
            newLabel={t('procurement.orders.new')}
            showNew={canCreateOrder}
            icon={<OrdersIcon />}
            stats={[
              { label: t('procurement.dashboard.totalOrders'), value: orderStats.total },
              { label: t('procurement.dashboard.draftOrders'), value: orderStats.draft },
              { label: t('procurement.dashboard.activeOrders'), value: orderStats.active },
            ]}
          />
        </div>
      </section>
    </ProtectedShell>
  );
}

function ProcurementDashboardCard({
  title,
  href,
  newHref,
  newLabel,
  showNew,
  icon,
  stats,
}: {
  title: string;
  href: string;
  newHref: string;
  newLabel: string;
  showNew: boolean;
  icon: ReactNode;
  stats: Array<{ label: string; value: number }>;
}) {
  return (
    <article className="group relative flex min-h-[260px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <Link href={href} className="absolute inset-0 rounded-3xl" aria-label={title} />

      <div className="relative flex flex-1 flex-col">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
          {icon}
        </div>

        <h3 className="mt-5 text-2xl font-bold text-slate-950">{title}</h3>

        <dl className="mt-5 space-y-2">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between gap-4 text-sm">
              <dt className="font-medium text-slate-500">{stat.label}</dt>
              <dd className="text-lg font-bold text-slate-950">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {showNew ? (
          <div className="relative z-10 mt-auto pt-6">
            <Link
              href={newHref}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <span aria-hidden>+</span>
              {newLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SupplierIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20V10l8-5 8 5v10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FactoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 20h18" strokeLinecap="round" />
      <path d="M6 20V9l4-2v13M14 20V6l4-2v16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12h1M10 15h1M18 10h1M18 13h1" strokeLinecap="round" />
    </svg>
  );
}

function TransportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 8h11v8H3z" strokeLinejoin="round" />
      <path d="M14 11h3l3 3v2h-6v-5z" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 4h10l1 3H6l1-3z" strokeLinejoin="round" />
      <path d="M6 7h12v13H6z" strokeLinejoin="round" />
      <path d="M9 11h6M9 15h4" strokeLinecap="round" />
    </svg>
  );
}
