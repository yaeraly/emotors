'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { ServiceOrder } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

export default function ServiceCashierPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<ServiceOrder[]>('/service-orders?status=READY_FOR_PAYMENT')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('service.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">Готово к оплате</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('service.orderNumber')}</th>
                <th className="px-4 py-3">{t('service.customer')}</th>
                <th className="px-4 py-3">{t('service.master')}</th>
                <th className="px-4 py-3">{t('service.totalAmount')}</th>
                <th className="px-4 py-3">{t('sales.debtAmount')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-bold">{order.orderNumber}</td>
                  <td className="px-4 py-3">{order.customer?.fullName}</td>
                  <td className="px-4 py-3">{order.master?.fullName}</td>
                  <td className="px-4 py-3">{Number(order.totalAmount).toLocaleString('ru-RU')} KGS</td>
                  <td className="px-4 py-3">{Number(order.debtAmount).toLocaleString('ru-RU')} KGS</td>
                  <td className="px-4 py-3">
                    <Link href={`/service/${order.id}`} className="rounded-lg border px-3 py-2 text-xs font-semibold">Оплата / Чек</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length ? <p className="p-6 text-sm text-slate-500">Нет заказов, ожидающих оплаты</p> : null}
        </div>
      </section>
    </ProtectedShell>
  );
}
