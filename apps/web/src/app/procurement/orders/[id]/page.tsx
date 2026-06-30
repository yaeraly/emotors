'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canCreateProcurementOrder,
  canReceiveProcurementToHq,
  hasRole,
} from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProcurementOrderItem = {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  receivedQuantity?: number | null;
  purchasePriceYuan: string | number;
  yuanRate: string | number;
  weightKg: string | number;
  totalWeightKg: string | number;
  costKgs: string | number;
  transportCostKgs: string | number;
  finalCostKgs: string | number;
  totalCostKgs: string | number;
  chinaDomesticAllocKgs?: string | number;
  chinaExportAllocKgs?: string | number;
  localTransportAllocKgs?: string | number;
  packagingAllocKgs?: string | number;
  customsAllocKgs?: string | number;
  insuranceAllocKgs?: string | number;
  bankFeeAllocKgs?: string | number;
  otherAllocKgs?: string | number;
  unit?: string;
  supplier?: { name: string };
  factory?: { name: string };
};

type ProcurementOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalYuan: string | number;
  totalCostKgs: string | number;
  totalTransportCostKgs: string | number;
  totalWeightKg: string | number;
  costPerKg: string | number;
  currency?: string;
  defaultYuanRate?: string | number;
  purchaseDate?: string;
  chinaDomesticTransportKgs: string | number;
  chinaExportTransportKgs: string | number;
  localTransportKgs: string | number;
  packagingCostKgs: string | number;
  customsCostKgs: string | number;
  insuranceCostKgs: string | number;
  bankFeeCostKgs: string | number;
  otherExpenseKgs: string | number;
  hqStockMovementCreatedAt?: string | null;
  supplier?: { name: string; companyName?: string };
  factory?: { name: string };
  hqWarehouse?: { name: string };
  estimatedArrivalDate?: string;
  actualArrivalDate?: string;
  receivedToHqAt?: string;
  items?: ProcurementOrderItem[];
  receivings?: Array<{ id: string; receivingNumber: string; receivedAt: string; items: Array<{ sku: string; productName: string; expectedQuantity: number; receivedQuantity: number; differenceQuantity: number }> }>;
  differenceReports?: Array<{ id: string; reportNumber: string; type: string; sku: string; productName: string; expectedQuantity: number; receivedQuantity: number; differenceQuantity: number; status: string; shortageReason?: string }>;
};

type AuditLog = { id: string; action: string; timestamp: string; metadata?: { reason?: string }; user?: { fullName: string } };

const SHORTAGE_REASONS = [
  'FACTORY_SHORTAGE',
  'SUPPLIER_SHORTAGE',
  'DAMAGED_GOODS',
  'LOST_IN_TRANSPORT',
  'CUSTOMS_ISSUE',
  'OTHER',
] as const;

const statusActions = [
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
  const [user, setUser] = useState<User | null>(null);
  const [order, setOrder] = useState<ProcurementOrder | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveReason, setReceiveReason] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canEditOrder = canCreateProcurementOrder(user);
  const readOnlyFinance = hasRole(user, 'FINANCE_MANAGER') || hasRole(user, 'ACCOUNTANT');
  const canReceive = canReceiveProcurementToHq(user);
  const readyForHqReceiving =
    order?.status === 'ARRIVED' ||
    order?.status === 'ARRIVED_IN_KYRGYZSTAN' ||
    order?.status === 'IN_TRANSIT';

  async function load() {
    try {
      const [orderResult, auditResult, me] = await Promise.all([
        apiFetch<ProcurementOrder>(`/procurement/orders/${id}`),
        apiFetch<AuditLog[]>(`/procurement/orders/${id}/audit-logs`),
        apiFetch<User>('/auth/me'),
      ]);
      setOrder(orderResult);
      setAuditLogs(auditResult);
      setUser(me);
      setReceiveQty(Object.fromEntries((orderResult.items ?? []).map((item) => [item.id, String(item.receivedQuantity ?? item.quantity)])));
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function receiveGoods() {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/procurement/orders/${id}/receive-to-hq`, {
        method: 'POST',
        body: JSON.stringify({
          items: (order?.items ?? []).map((item) => ({
            procurementItemId: item.id,
            receivedQuantity: Number(receiveQty[item.id] ?? item.quantity),
            shortageReason: Number(receiveQty[item.id] ?? item.quantity) !== item.quantity
              ? (receiveReason[item.id] || 'OTHER')
              : undefined,
          })),
        }),
      });
      setSuccess(t('procurement.orders.received'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('procurement.orders.title')}</p>
            <h2 className="text-3xl font-bold">{order?.orderNumber ?? '-'}</h2>
          </div>
          {canEditOrder && order && !order.hqStockMovementCreatedAt ? (
            <Link href={`/procurement/orders/${id}/edit`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{t('procurement.orders.edit')}</Link>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
        {readOnlyFinance ? <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{t('procurement.orders.readOnlyFinance')}</p> : null}

        {order ? <>
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
            <Info label={t('procurement.orders.supplier')} value={order.supplier?.name ?? ''} />
            <Info label={t('procurement.orders.currency')} value={order.currency ?? 'CNY'} />
            <Info label={t('procurement.orders.exchangeRate')} value={String(order.defaultYuanRate ?? '-')} />
            <Info label={t('procurement.orders.purchaseDate')} value={order.purchaseDate ? new Date(order.purchaseDate).toLocaleDateString() : '-'} />
            <Info label={t('procurement.orders.warehouse')} value={order.hqWarehouse?.name ?? ''} />
            <Info label={t('procurement.orders.status')} value={order.status} />
            <Info label={t('procurement.orders.totalYuan')} value={`¥${Number(order.totalYuan).toFixed(2)}`} />
            <Info label={t('procurement.orders.totalCostKgs')} value={formatKgs(order.totalCostKgs)} />
            <Info label={t('procurement.orders.totalWeightKg')} value={`${Number(order.totalWeightKg).toFixed(3)} kg`} />
            <Info label={t('procurement.orders.costPerKg')} value={formatKgs(order.costPerKg)} />
          </section>

          {canEditOrder && !order.hqStockMovementCreatedAt ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {statusActions.map(([path, label]) => <button key={path} onClick={() => void action(path)} type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{t(label)}</button>)}
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.transportCosts')}</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <Info label={t('procurement.orders.chinaDomestic')} value={formatKgs(order.chinaDomesticTransportKgs)} />
              <Info label={t('procurement.orders.chinaExport')} value={formatKgs(order.chinaExportTransportKgs)} />
              <Info label={t('procurement.orders.localTransport')} value={formatKgs(order.localTransportKgs)} />
              <Info label={t('procurement.orders.packaging')} value={formatKgs(order.packagingCostKgs)} />
              <Info label={t('procurement.orders.customs')} value={formatKgs(order.customsCostKgs)} />
              <Info label={t('procurement.orders.insurance')} value={formatKgs(order.insuranceCostKgs)} />
              <Info label={t('procurement.orders.bankFees')} value={formatKgs(order.bankFeeCostKgs)} />
              <Info label={t('procurement.orders.otherExpenses')} value={formatKgs(order.otherExpenseKgs)} />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.landedCostSummary')}</h3>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.quantity')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.receivedQty')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.unit')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.weightPerUnit')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.totalWeightKg')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.factoryCost')}</th>
                  <th className="px-4 py-3">{t('procurement.orders.transportAllocation')}</th>
                  <th className="px-4 py-3">{t('inventory.finalCostKgs')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items?.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{item.sku}</td>
                    <td className="px-4 py-3">{item.productName}</td>
                    <td className="px-4 py-3">{item.quantity}</td>
                    <td className="px-4 py-3">{item.receivedQuantity ?? '-'}</td>
                    <td className="px-4 py-3">{item.unit ?? 'pcs'}</td>
                    <td className="px-4 py-3">{Number(item.weightKg).toFixed(3)}</td>
                    <td className="px-4 py-3">{Number(item.totalWeightKg).toFixed(3)}</td>
                    <td className="px-4 py-3">{formatKgs(item.costKgs)}</td>
                    <td className="px-4 py-3">{formatKgs(item.transportCostKgs)}</td>
                    <td className="px-4 py-3 font-semibold">{formatKgs(item.finalCostKgs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {canReceive && readyForHqReceiving && !order.hqStockMovementCreatedAt ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.receivingSummary')}</h3>
              <div className="space-y-3">
                {order.items?.map((item) => {
                  const received = Number(receiveQty[item.id] ?? item.quantity);
                  const hasDifference = received !== item.quantity;
                  return (
                  <label key={item.id} className="block rounded-2xl bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="min-w-48 font-semibold">{item.sku} · {item.productName}</span>
                      <span className="text-sm text-slate-500">{t('procurement.orders.expected')}: {item.quantity}</span>
                      <input type="number" min={0} value={receiveQty[item.id] ?? String(item.quantity)} onChange={(e) => setReceiveQty((current) => ({ ...current, [item.id]: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2" />
                      {hasDifference ? (
                        <select value={receiveReason[item.id] ?? 'OTHER'} onChange={(e) => setReceiveReason((current) => ({ ...current, [item.id]: e.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                          {SHORTAGE_REASONS.map((reason) => <option key={reason} value={reason}>{t(`procurement.orders.shortageReason.${reason}`)}</option>)}
                        </select>
                      ) : null}
                    </div>
                  </label>
                );})}
              </div>
              <button type="button" onClick={() => void receiveGoods()} className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white">{t('procurement.orders.receiveToHq')}</button>
            </section>
          ) : null}

          {order.differenceReports && order.differenceReports.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.shortageReport')}</h3>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t('procurement.orders.expected')}</th><th className="px-4 py-3">{t('procurement.orders.receivedQty')}</th><th className="px-4 py-3">{t('procurement.orders.difference')}</th><th className="px-4 py-3">{t('procurement.orders.shortageReasonLabel')}</th><th className="px-4 py-3">{t('procurement.orders.status')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{order.differenceReports.map((report) => <tr key={report.id}><td className="px-4 py-3">{report.reportNumber}</td><td className="px-4 py-3">{report.sku}</td><td className="px-4 py-3">{report.expectedQuantity}</td><td className="px-4 py-3">{report.receivedQuantity}</td><td className="px-4 py-3">{report.differenceQuantity} ({report.type})</td><td className="px-4 py-3">{report.shortageReason ? t(`procurement.orders.shortageReason.${report.shortageReason}`) : '-'}</td><td className="px-4 py-3">{report.status}</td></tr>)}</tbody>
              </table>
            </section>
          ) : null}

          {order.receivings && order.receivings.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.receivingHistory')}</h3>
              {order.receivings.map((receiving) => (
                <div key={receiving.id} className="mb-4 rounded-2xl border border-slate-100 p-4">
                  <p className="font-semibold">{receiving.receivingNumber} · {new Date(receiving.receivedAt).toLocaleString()}</p>
                </div>
              ))}
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">{t('procurement.orders.auditHistory')}</h3>
            <div className="space-y-3">
              {auditLogs.length ? auditLogs.map((log) => (
                <div key={log.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                  <p className="font-semibold">{log.action}</p>
                  <p className="text-slate-500">{log.user?.fullName ?? '-'} · {new Date(log.timestamp).toLocaleString()}</p>
                </div>
              )) : <p className="text-sm text-slate-500">{t('procurement.orders.noAudit')}</p>}
            </div>
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
