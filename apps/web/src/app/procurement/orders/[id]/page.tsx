'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalYuan: string | number;
  totalCostKgs: string | number;
  supplier?: { name: string; companyName?: string };
  factory?: { name: string };
  hqWarehouse?: { name: string };
  estimatedArrivalDate?: string;
  actualArrivalDate?: string;
  items?: Array<{ id: string; sku: string; productName: string; quantity: number; purchasePriceYuan: string | number; finalCostKgs: string | number; totalCostKgs: string | number }>;
};

const actions = [
  ['approve', 'distribution.approve'],
  ['mark-paid', 'paymentStatus.PAID'],
  ['mark-production', 'procurement.inProduction'],
  ['mark-shipped-to-yiwu', 'procurement.shippedToYiwu'],
  ['mark-in-transit', 'procurement.inTransit'],
  ['mark-arrived', 'procurement.markArrived'],
  ['cancel', 'distribution.cancel'],
] as const;

export default function ProcurementOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<ProcurementOrder | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      setOrder(await apiFetch<ProcurementOrder>(`/procurement/orders/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(path: string) {
    setError('');
    setSuccess('');
    try {
      setOrder(await apiFetch<ProcurementOrder>(`/procurement/orders/${id}/${path}`, { method: 'POST' }));
      setSuccess(t('common.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.orders.title')}</p><h2 className="text-3xl font-bold">{order?.orderNumber ?? '-'}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {order ? <>
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
            <Info label={t('procurement.orders.supplier')} value={order.supplier?.name ?? ''} />
            <Info label={t('procurement.orders.factory')} value={order.factory?.name ?? '-'} />
            <Info label={t('procurement.orders.warehouse')} value={order.hqWarehouse?.name ?? ''} />
            <Info label={t('procurement.orders.status')} value={order.status} />
            <Info label={t('procurement.orders.totalYuan')} value={`¥${Number(order.totalYuan).toFixed(2)}`} />
            <Info label={t('procurement.orders.totalCostKgs')} value={formatKgs(order.totalCostKgs)} />
            <Info label={t('procurement.orders.estimatedArrivalDate')} value={order.estimatedArrivalDate ? new Date(order.estimatedArrivalDate).toLocaleDateString() : '-'} />
            <Info label={t('procurement.orders.actualArrivalDate')} value={order.actualArrivalDate ? new Date(order.actualArrivalDate).toLocaleDateString() : '-'} />
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {actions.map(([path, label]) => <button key={path} onClick={() => void action(path)} type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{t(label)}</button>)}
            </div>
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t('procurement.orders.product')}</th><th className="px-4 py-3">{t('procurement.orders.quantity')}</th><th className="px-4 py-3">{t('procurement.orders.purchasePriceYuan')}</th><th className="px-4 py-3">{t('inventory.finalCostKgs')}</th></tr></thead><tbody className="divide-y divide-slate-100">{order.items?.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.sku}</td><td className="px-4 py-3">{item.productName}</td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">¥{Number(item.purchasePriceYuan).toFixed(2)}</td><td className="px-4 py-3">{formatKgs(item.finalCostKgs)}</td></tr>)}</tbody></table>
          </section>
        </> : null}
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
