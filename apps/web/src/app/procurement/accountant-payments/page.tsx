'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canCreateSupplierPayment } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type QueueOrder = {
  id: string;
  orderNumber: string;
  supplier?: { name: string };
  totalYuan: number;
  totalPaidYuan: number;
  remainingYuan: number;
  supplierPaymentStatus: string;
  completedPaymentCount: number;
  invoiceSentToAccountantAt?: string | null;
};

export default function AccountantPaymentsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then(async (current) => {
        setUser(current);
        if (!canCreateSupplierPayment(current)) return;
        const queue = await apiFetch<QueueOrder[]>('/procurement/accountant-payment-queue');
        setOrders(queue);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{t('procurement.payments.accountantQueue')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('procurement.payments.sendInvoiceHelp')}</p>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('procurement.orders.orderNumber') || '№'}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.title')}</th>
                <th className="px-4 py-3">{t('procurement.payments.totalOrderYuan')}</th>
                <th className="px-4 py-3">{t('procurement.payments.totalPaidYuan')}</th>
                <th className="px-4 py-3">{t('procurement.payments.remainingYuan')}</th>
                <th className="px-4 py-3">{t('procurement.payments.paymentStatus')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length ? orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-semibold">{order.orderNumber}</td>
                  <td className="px-4 py-3">{order.supplier?.name || '-'}</td>
                  <td className="px-4 py-3">¥{Number(order.totalYuan).toFixed(2)}</td>
                  <td className="px-4 py-3">¥{Number(order.totalPaidYuan).toFixed(2)}</td>
                  <td className="px-4 py-3">¥{Number(order.remainingYuan).toFixed(2)}</td>
                  <td className="px-4 py-3">{t(`procurement.payments.status.${order.supplierPaymentStatus}`)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/procurement/orders/${order.id}`} className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
                      {t('common.open') || 'Open'}
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr><td className="px-4 py-8 text-slate-500" colSpan={7}>{t('procurement.payments.noPayments')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!user || canCreateSupplierPayment(user) ? null : (
          <p className="text-sm text-slate-500">{t('errors.accessDenied') || 'Access denied'}</p>
        )}
      </div>
    </ProtectedShell>
  );
}
