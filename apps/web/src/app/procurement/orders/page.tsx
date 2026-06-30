'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canCreateProcurementOrder } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProcurementOrder = {
  id: string;
  orderNumber: string;
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

  useEffect(() => {
    const message = window.localStorage.getItem('emotors_procurement_success');
    if (message) {
      setSuccess(message);
      window.localStorage.removeItem('emotors_procurement_success');
    }
    apiFetch<ProcurementOrder[]>('/procurement/orders')
      .then((result) => {
        setOrders(result);
        void apiFetch<User>('/auth/me').then(setCurrentUser).catch(() => null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

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
              <tr><th className="px-4 py-3">{t('procurement.orders.orderNumber')}</th><th className="px-4 py-3">{t('procurement.orders.supplier')}</th><th className="px-4 py-3">{t('procurement.orders.factory')}</th><th className="px-4 py-3">{t('procurement.orders.status')}</th><th className="px-4 py-3">{t('procurement.orders.totalYuan')}</th><th className="px-4 py-3">{t('procurement.orders.totalCostKgs')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => <tr key={order.id}><td className="px-4 py-3 font-bold">{order.orderNumber}</td><td className="px-4 py-3">{order.supplier?.name ?? '-'}</td><td className="px-4 py-3">{order.factory?.name ?? '-'}</td><td className="px-4 py-3">{order.status}</td><td className="px-4 py-3">¥{Number(order.totalYuan ?? 0).toFixed(2)}</td><td className="px-4 py-3">{formatKgs(order.totalCostKgs)}</td><td className="px-4 py-3"><Link href={`/procurement/orders/${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
