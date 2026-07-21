'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ProcurementHubNav } from '@/components/procurement/ProcurementHubNav';
import { apiFetch } from '@/lib/api';
import { canViewSupplierPayments } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type QueueOrder = {
  id: string;
  orderNumber: string;
  supplier?: { name: string };
  totalYuan: number;
  totalPaidYuan: number;
  remainingYuan: number;
  requestedPaymentYuan?: number | null;
  supplierPaymentStatus: string;
  completedPaymentCount: number;
  hasPaymentInfo?: boolean;
  activePaymentMethod?: string | null;
  invoiceSentToAccountantAt?: string | null;
  purchaseDate?: string | null;
};

export default function SupplyManagerPaymentsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then(async (current) => {
        setUser(current);
        if (!canViewSupplierPayments(current)) {
          setLoading(false);
          return;
        }
        const queue = await apiFetch<QueueOrder[]>('/procurement/supply-manager-payment-queue');
        setOrders(queue);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <ProtectedShell>
      <div className="space-y-6 p-6">
        <ProcurementHubNav activeTab="payments" />
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{t('procurement.payments.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('procurement.payments.smQueueHelp')}</p>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}
        {!loading && user && !canViewSupplierPayments(user) ? (
          <p className="text-sm text-slate-500">{t('errors.procurementAccessDenied')}</p>
        ) : null}
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('procurement.orders.orderNumber')}</th>
                <th className="px-4 py-3">{t('procurement.suppliers.title')}</th>
                <th className="px-4 py-3">{t('procurement.payments.totalOrderYuan')}</th>
                <th className="px-4 py-3">{t('procurement.payments.totalPaidYuan')}</th>
                <th className="px-4 py-3">{t('procurement.payments.remainingYuan')}</th>
                <th className="px-4 py-3">{t('procurement.payments.paymentCount')}</th>
                <th className="px-4 py-3">{t('procurement.payments.paymentStatus')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length ? (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-semibold">{order.orderNumber}</td>
                    <td className="px-4 py-3">{order.supplier?.name || '—'}</td>
                    <td className="px-4 py-3">¥{Number(order.totalYuan).toFixed(2)}</td>
                    <td className="px-4 py-3">¥{Number(order.totalPaidYuan).toFixed(2)}</td>
                    <td className="px-4 py-3">¥{Number(order.remainingYuan).toFixed(2)}</td>
                    <td className="px-4 py-3">{order.completedPaymentCount}</td>
                    <td className="px-4 py-3">
                      {t(`procurement.payments.status.${order.supplierPaymentStatus}`)}
                      {!order.hasPaymentInfo && order.supplierPaymentStatus === 'UNPAID' ? (
                        <span className="mt-1 block text-xs font-medium text-amber-700">
                          {t('procurement.payments.needsPaymentInfo')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/procurement/orders/${order.id}?tab=payments`}
                        className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700"
                      >
                        {t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))
              ) : !loading ? (
                <tr>
                  <td className="px-4 py-8 text-slate-500" colSpan={8}>
                    {t('procurement.payments.noPayments')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedShell>
  );
}
