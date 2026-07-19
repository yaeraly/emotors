'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { BranchDistributionOrder } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

const RECEIVED_STATUSES = ['RECEIVED', 'RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE', 'COMPLETED'];

export default function BranchManagerShipmentsPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<BranchDistributionOrder[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<BranchDistributionOrder[]>('/distribution/orders')
      .then((rows) => setOrders(rows.filter((row) => RECEIVED_STATUSES.includes(row.status))))
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) => order.orderNumber.toLowerCase().includes(query));
  }, [orders, search]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchManager.incomingShipments')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branchManager.incomingShipments')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('common.search')}
          className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2 text-sm"
        />
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('distribution.orderNumber')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('distribution.totalBatchWeightCalculated')}</th>
                <th className="px-4 py-3">{t('branchManager.transportExpenses')}</th>
                <th className="px-4 py-3">{t('common.createdDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((order) => {
                const transportEntered = Number(order.transportCostKgs ?? 0) > 0 || Boolean(order.deliveryCostEnteredAt);
                return (
                  <tr key={order.id} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/branch-manager/shipments/${order.id}`} className="font-semibold text-blue-700">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{translateStatus(t, order.status, 'distribution')}</td>
                    <td className="px-4 py-3">
                      {Number(order.totalShipmentWeightKg ?? order.shipmentWeightSummary?.totalWeightKg ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} {t('distribution.weightUnitKg')}
                    </td>
                    <td className="px-4 py-3">
                      {transportEntered ? t('branchManager.transportEntered') : t('branchManager.transportPending')}
                    </td>
                    <td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {t('procurement.dashboard.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
