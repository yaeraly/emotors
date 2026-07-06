'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { ServiceOrder } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

export default function ServicePage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<ServiceOrder[]>('/service-orders')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('service.title')}</h2>
          </div>
          <Link href="/service/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">{t('service.newOrder')}</Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="h-[calc(100vh-240px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t('service.orderNumber')}</th><th className="px-4 py-3">{t('service.customer')}</th><th className="px-4 py-3">{t('service.master')}</th><th className="px-4 py-3">{t('service.status')}</th><th className="px-4 py-3">{t('service.problem')}</th><th className="px-4 py-3">{t('service.totalAmount')}</th><th className="px-4 py-3">{t('sales.paidAmount')}</th><th className="px-4 py-3">{t('sales.debtAmount')}</th><th className="px-4 py-3">{t('common.createdDate')}</th><th className="px-4 py-3">{t('common.actions')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => <tr key={order.id}><td className="px-4 py-3 font-bold">{order.orderNumber}</td><td className="px-4 py-3">{order.customer?.fullName}</td><td className="px-4 py-3">{order.master?.fullName}</td><td className="px-4 py-3">{translateStatus(t, order.status, 'service')}</td><td className="px-4 py-3">{order.problemDescription}</td><td className="px-4 py-3">{formatKgs(order.totalAmount)}</td><td className="px-4 py-3">{formatKgs(order.paidAmount)}</td><td className="px-4 py-3">{formatKgs(order.debtAmount)}</td><td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString()}</td><td className="px-4 py-3"><Link href={`/service/${order.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link></td></tr>)}
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
