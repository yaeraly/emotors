'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canDispatchFromHq,
  canManageDistributionOrders,
  canRecordDistributionPayment,
} from '@/lib/rbac';
import type { BranchDistributionOrder, GoodsReceiving, ShortageReport, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ReceiveItemForm = {
  distributionOrderItemId: string;
  sentQuantity: number;
  receivedQuantity: string;
  note: string;
};

export default function DistributionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<BranchDistributionOrder | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [receiveItems, setReceiveItems] = useState<ReceiveItemForm[]>([]);
  const [receiving, setReceiving] = useState<GoodsReceiving | null>(null);
  const [shortageReport, setShortageReport] = useState<ShortageReport | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingReceive, setSubmittingReceive] = useState(false);

  async function load() {
    try {
      const [result, me] = await Promise.all([
        apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}`),
        apiFetch<User>('/auth/me'),
      ]);
      setCurrentUser(me);
      setOrder(result);
      setReceiveItems(
        result.items?.map((item) => ({
          distributionOrderItemId: item.id,
          sentQuantity: item.quantity,
          receivedQuantity: String(item.quantity),
          note: '',
        })) ?? [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(
    path:
      | 'approve'
      | 'send-invoice'
      | 'send-to-warehouse'
      | 'pick'
      | 'pack'
      | 'send'
      | 'complete'
      | 'cancel',
    message: string,
  ) {
    if (path === 'send' && !window.confirm(t('distribution.confirmSendDeductStock'))) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      setOrder(
        await apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}/${path}`, {
          method: 'POST',
          body: path === 'send-to-warehouse' ? JSON.stringify({}) : undefined,
        }),
      );
      setSuccess(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function updateReceiveItem(index: number, updates: Partial<ReceiveItemForm>) {
    setReceiveItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  }

  async function completeReceiving() {
    if (!order) return;
    setError('');
    setSuccess('');
    setSubmittingReceive(true);
    try {
      const result = await apiFetch<{
        receiving: GoodsReceiving;
        shortageReport: ShortageReport | null;
      }>(`/distribution/orders/${order.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: order.destinationWarehouseId,
          note: '',
          items: receiveItems.map((item) => ({
            distributionOrderItemId: item.distributionOrderItemId,
            receivedQuantity: Number(item.receivedQuantity || 0),
            note: item.note || undefined,
          })),
        }),
      });
      setReceiving(result.receiving);
      setShortageReport(result.shortageReport);
      setSuccess(
        result.shortageReport
          ? t('distribution.hasDifferences')
          : t('distribution.goodsReceivingCreated'),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingReceive(false);
    }
  }

  const canApprove = canManageDistributionOrders(currentUser);
  const canDispatch = canDispatchFromHq(currentUser);
  const canReceiveAtBranch =
    currentUser?.role === 'WAREHOUSE_OPERATOR' ||
    currentUser?.roles?.includes('WAREHOUSE_OPERATOR') ||
    currentUser?.role === 'FRANCHISE_OWNER' ||
    currentUser?.roles?.includes('FRANCHISE_OWNER') ||
    currentUser?.role === 'MANAGER' ||
    currentUser?.roles?.includes('MANAGER');
  const canPay = canRecordDistributionPayment(currentUser);

  const invoiceSent = Boolean(order?.branchInvoice?.sentToBranchAt);
  const canReceive =
    order?.status === 'SHIPPED' ||
    order?.status === 'SENT';

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
                {order.status === 'DRAFT' && canApprove ? (
                  <button onClick={() => void action('approve', t('distribution.orderApproved'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.approve')}
                  </button>
                ) : null}
                {order.status === 'INVOICED' && canApprove && !invoiceSent ? (
                  <button onClick={() => void action('send-invoice', t('distribution.invoiceSent'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.sendInvoice')}
                  </button>
                ) : null}
                {['INVOICED', 'PAYMENT_PENDING', 'PAID'].includes(order.status) && canApprove && invoiceSent ? (
                  <button onClick={() => void action('send-to-warehouse', t('distribution.sentToWarehouse'))} className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.sendToWarehouse')}
                  </button>
                ) : null}
                {order.status === 'SENT_TO_WAREHOUSE' && canDispatch ? (
                  <button onClick={() => void action('pick', t('distribution.pickingStarted'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.pick')}
                  </button>
                ) : null}
                {order.status === 'PICKING' && canDispatch ? (
                  <button onClick={() => void action('pack', t('distribution.packed'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.pack')}
                  </button>
                ) : null}
                {order.status === 'PACKED' && canDispatch ? (
                  <button onClick={() => void action('send', t('distribution.orderSent'))} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.send')}
                  </button>
                ) : null}
                {['RECEIVED', 'RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE'].includes(order.status) && canApprove ? (
                  <button onClick={() => void action('complete', t('distribution.orderCompleted'))} className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.complete')}
                  </button>
                ) : null}
                {['DRAFT', 'INVOICED', 'PAYMENT_PENDING', 'PAID', 'SENT_TO_WAREHOUSE', 'PICKING', 'PACKED'].includes(order.status) && (canApprove || canDispatch) ? (
                  <button onClick={() => void action('cancel', t('distribution.orderCancelled'))} className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600" type="button">
                    {t('distribution.cancel')}
                  </button>
                ) : null}
              </div>
            </section>
            {order.branchInvoice ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.invoice')}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <Info label={t('distribution.invoiceNumber')} value={order.branchInvoice.invoiceNumber} />
                  <Info label={t('distribution.totalAmount')} value={formatKgs(order.branchInvoice.totalAmount)} />
                  <Info label={t('distribution.paidAmount')} value={formatKgs(order.branchInvoice.paidAmount)} />
                  <Info label={t('distribution.debtAmount')} value={formatKgs(order.branchInvoice.debtAmount)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`/distribution/invoices/${order.branchInvoice.id}`} className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
                    {canPay ? t('distribution.registerPayment') : t('common.open')}
                  </a>
                  {invoiceSent ? (
                    <span className="rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
                      {t('distribution.invoiceSentAt')}: {new Date(order.branchInvoice.sentToBranchAt!).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </section>
            ) : null}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('distribution.items')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">{t('sales.product')}</th><th className="px-4 py-3">{t('distribution.quantity')}</th><th className="px-4 py-3">{t('distribution.unitCost')}</th><th className="px-4 py-3">{t('distribution.unitPrice')}</th><th className="px-4 py-3">{t('distribution.profit')}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{order.items?.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.sku}</td><td className="px-4 py-3">{item.productName}</td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{formatKgs(item.unitCost)}</td><td className="px-4 py-3">{formatKgs(item.unitPrice)}</td><td className="px-4 py-3">{formatKgs(item.profit)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
            {canReceive && canReceiveAtBranch ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.receiveGoods')}</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">{t('sales.product')}</th>
                        <th className="px-4 py-3">{t('distribution.sentQuantity')}</th>
                        <th className="px-4 py-3">{t('distribution.receivedQuantity')}</th>
                        <th className="px-4 py-3">{t('distribution.difference')}</th>
                        <th className="px-4 py-3">{t('crm.notes')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.items?.map((item, index) => {
                        const form = receiveItems[index];
                        const receivedQuantity = Number(form?.receivedQuantity || 0);
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3">{item.sku}</td>
                            <td className="px-4 py-3">{item.productName}</td>
                            <td className="px-4 py-3">{item.quantity}</td>
                            <td className="px-4 py-3">
                              <input
                                value={form?.receivedQuantity ?? ''}
                                onChange={(event) => updateReceiveItem(index, { receivedQuantity: event.target.value })}
                                type="number"
                                min="0"
                                className="w-28 rounded-xl border border-slate-300 px-3 py-2"
                              />
                            </td>
                            <td className="px-4 py-3 font-semibold">
                              {receivedQuantity - item.quantity}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                value={form?.note ?? ''}
                                onChange={(event) => updateReceiveItem(index, { note: event.target.value })}
                                className="min-w-40 rounded-xl border border-slate-300 px-3 py-2"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() => void completeReceiving()}
                  disabled={submittingReceive}
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
                  type="button"
                >
                  {submittingReceive ? t('common.loading') : t('distribution.completeReceiving')}
                </button>
              </section>
            ) : null}
            {receiving ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.receivingNumber')}: {receiving.receivingNumber}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {shortageReport ? t('distribution.hasDifferences') : t('distribution.noDifferences')}
                </p>
                {shortageReport ? (
                  <a href={`/distribution/shortage-reports/${shortageReport.id}`} className="mt-3 inline-flex rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700">
                    {t('distribution.shortageReport')} {shortageReport.reportNumber}
                  </a>
                ) : null}
              </section>
            ) : null}
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
