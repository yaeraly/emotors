'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canConfirmSupplierPayment } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type QueuePayment = {
  id: string;
  sequenceNumber: number;
  amountYuan: number;
  exchangeRate: number;
  approvedAmountKgs: number;
  recipientName?: string | null;
  paymentMethod: string;
  sentToCashierAt?: string | null;
  accountant?: { fullName: string } | null;
  intendedFinanceAccount?: { name: string; availableBalance?: number } | null;
  order?: {
    id: string;
    orderNumber: string;
    supplier?: { name: string };
    remainingYuan: number;
    totalYuan: number;
  } | null;
};

export default function CashierPaymentsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [payments, setPayments] = useState<QueuePayment[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiFetch<User>('/auth/me')
      .then(async (current) => {
        setUser(current);
        if (!canConfirmSupplierPayment(current)) return;
        const queue = await apiFetch<QueuePayment[]>('/procurement/cashier-payment-queue');
        setPayments(queue);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{t('procurement.payments.cashierQueue')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('procurement.payments.receiptRequiredHint')}</p>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('procurement.orders.orderNumber') || 'Order'}</th>
                <th className="px-4 py-3">{t('procurement.payments.sequence')}</th>
                <th className="px-4 py-3">{t('procurement.payments.amountYuan')}</th>
                <th className="px-4 py-3">{t('procurement.payments.exchangeRate')}</th>
                <th className="px-4 py-3">{t('procurement.payments.approvedKgs')}</th>
                <th className="px-4 py-3">{t('procurement.payments.recipientName')}</th>
                <th className="px-4 py-3">{t('procurement.payments.financeAccount')}</th>
                <th className="px-4 py-3">{t('procurement.payments.accountant')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length ? payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{payment.order?.orderNumber}</div>
                    <div className="text-xs text-slate-500">{payment.order?.supplier?.name}</div>
                  </td>
                  <td className="px-4 py-3">#{payment.sequenceNumber}</td>
                  <td className="px-4 py-3">¥{Number(payment.amountYuan).toFixed(2)}</td>
                  <td className="px-4 py-3">{Number(payment.exchangeRate).toFixed(4)}</td>
                  <td className="px-4 py-3">{Number(payment.approvedAmountKgs).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">{payment.recipientName || '-'}</td>
                  <td className="px-4 py-3">{payment.intendedFinanceAccount?.name || '-'}</td>
                  <td className="px-4 py-3">{payment.accountant?.fullName || '-'}</td>
                  <td className="px-4 py-3">
                    {payment.order?.id ? (
                      <Link href={`/procurement/orders/${payment.order.id}`} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                        {t('procurement.payments.confirmPayment')}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              )) : (
                <tr><td className="px-4 py-8 text-slate-500" colSpan={9}>{t('procurement.payments.noPayments')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!user || canConfirmSupplierPayment(user) ? null : (
          <p className="text-sm text-slate-500">Access denied</p>
        )}
      </div>
    </ProtectedShell>
  );
}
