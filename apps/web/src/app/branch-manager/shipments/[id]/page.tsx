'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ReceivingTransportCostSection } from '@/components/distribution/ReceivingTransportCostSection';
import { apiFetch } from '@/lib/api';
import type { BranchDistributionOrder } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function BranchManagerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<BranchDistributionOrder | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const result = await apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}`);
    setOrder(result);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  const weightSummary = order?.shipmentWeightSummary;
  const transportEntered = Boolean(order && (Number(order.transportCostKgs ?? 0) > 0 || order.deliveryCostEnteredAt));

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/branch-manager/shipments" className="text-sm font-semibold text-blue-600">
            ← {t('branchManager.incomingShipments')}
          </Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{order?.orderNumber ?? '—'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {order ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-4">
                <Info label={t('distribution.status')} value={translateStatus(t, order.status, 'distribution')} />
                <Info label={t('distribution.branch')} value={order.branch?.name ?? ''} />
                <Info
                  label={t('distribution.totalBatchWeightCalculated')}
                  value={`${Number(weightSummary?.totalWeightKg ?? order.totalShipmentWeightKg ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${t('distribution.weightUnitKg')}`}
                />
                <Info
                  label={t('branchManager.transportExpenses')}
                  value={transportEntered ? t('branchManager.transportEntered') : t('branchManager.transportPending')}
                />
              </div>
              {!transportEntered ? (
                <p className="mt-4 text-sm text-amber-700">
                  {t('distribution.receivingTransportPendingHint')}
                </p>
              ) : null}
            </section>
            <ReceivingTransportCostSection order={order} canEnter={false} onUpdated={setOrder} />
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('distribution.items')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">{t('sales.product')}</th>
                      <th className="px-4 py-3">{t('distribution.quantity')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.dispatchedQuantity ?? item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}
