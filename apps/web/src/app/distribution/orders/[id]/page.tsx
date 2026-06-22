'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { BranchDistributionOrder } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

export default function DistributionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<BranchDistributionOrder | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      setOrder(await apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(path: 'approve' | 'send' | 'cancel', message: string) {
    setError('');
    setSuccess('');
    try {
      setOrder(await apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}/${path}`, { method: 'POST' }));
      setSuccess(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('distribution.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{order?.orderNumber ?? '-'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {order ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-4">
                <Info label={t('distribution.branch')} value={order.branch?.name ?? ''} />
                <Info label={t('distribution.sourceWarehouse')} value={order.sourceWarehouse?.name ?? ''} />
                <Info label={t('distribution.destinationWarehouse')} value={order.destinationWarehouse?.name ?? ''} />
                <Info label={t('distribution.status')} value={order.status} />
                <Info label={t('distribution.totalAmount')} value={formatKgs(order.totalAmount)} />
                <Info label={t('distribution.totalCost')} value={formatKgs(order.totalCost)} />
                <Info label={t('distribution.totalProfit')} value={formatKgs(order.totalProfit)} />
                <Info label={t('common.createdDate')} value={new Date(order.createdAt).toLocaleString()} />
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {order.status === 'DRAFT' ? <button onClick={() => void action('approve', t('distribution.orderApproved'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">{t('distribution.approve')}</button> : null}
                {order.status === 'APPROVED' ? <button onClick={() => void action('send', t('distribution.orderSent'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">{t('distribution.send')}</button> : null}
                {(order.status === 'DRAFT' || order.status === 'APPROVED') ? <button onClick={() => void action('cancel', t('distribution.orderCancelled'))} className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600" type="button">{t('distribution.cancel')}</button> : null}
              </div>
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('distribution.items')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t('sales.product')}</th><th className="px-4 py-3">{t('distribution.quantity')}</th><th className="px-4 py-3">{t('distribution.unitCost')}</th><th className="px-4 py-3">{t('distribution.unitPrice')}</th><th className="px-4 py-3">{t('distribution.profit')}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{order.items?.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.sku}</td><td className="px-4 py-3">{item.productName}</td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{formatKgs(item.unitCost)}</td><td className="px-4 py-3">{formatKgs(item.unitPrice)}</td><td className="px-4 py-3">{formatKgs(item.profit)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}
function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
