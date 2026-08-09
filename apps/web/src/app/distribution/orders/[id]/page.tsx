'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersSection } from '@/components/HqSalesBranchOrdersSection';
import { apiFetch } from '@/lib/api';
import {
  canCancelBranchDistributionOrder,
  canDispatchFromHq,
  canEnterBranchTransportCost,
  canManageDistributionOrders,
  canReceiveBranchDistribution,
  canRecordDistributionPayment,
  canViewProductCost,
  isBranchWarehouseOperator,
  isHqSalesManagerUser,
  isHqWarehouseLogisticsOnlyUser,
} from '@/lib/rbac';
import { ReceivingTransportCostSection } from '@/components/distribution/ReceivingTransportCostSection';
import { BranchReceivingWorkspace } from '@/components/distribution/BranchReceivingWorkspace';
import type { BranchDistributionOrder, GoodsReceiving, ShortageReport, User } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { shouldShowReceivingBranchField } from '@/lib/branch-receiving-ui';
import { buildHqDispatchSendPayload, shouldShowHqDispatchTransportFields } from '@/lib/hq-dispatch-form';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

export default function DistributionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<BranchDistributionOrder | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [receiving, setReceiving] = useState<GoodsReceiving | null>(null);
  const [shortageReport, setShortageReport] = useState<ShortageReport | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      const [result, me] = await Promise.all([
        apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}`),
        apiFetch<User>('/auth/me'),
      ]);
      setCurrentUser(me);
      setOrder(result);
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
    body?: Record<string, unknown>,
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
          body: body ? JSON.stringify(body) : path === 'send-to-warehouse' ? JSON.stringify({}) : undefined,
        }),
      );
      setSuccess(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setItemPicked(itemId: string, picked: boolean) {
    setError('');
    setSuccess('');
    try {
      setOrder(
        await apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}/items/${itemId}/picked`, {
          method: 'PATCH',
          body: JSON.stringify({ picked }),
        }),
      );
      setSuccess(picked ? t('distribution.itemPickedDone') : t('distribution.undoItemPick'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function dispatchShipment() {
    await action('send', t('distribution.orderSent'), buildHqDispatchSendPayload());
  }

  const canApprove = canManageDistributionOrders(currentUser);
  const canCancel = canCancelBranchDistributionOrder(currentUser);
  const canDispatch = canDispatchFromHq(currentUser);
  const canReceiveAtBranch = canReceiveBranchDistribution(currentUser);
  const canEnterTransport = canEnterBranchTransportCost(currentUser);
  const canPay = canRecordDistributionPayment(currentUser);
  const showFinancials = canViewProductCost(currentUser) && !isHqWarehouseLogisticsOnlyUser(currentUser);
  const operatorView = isBranchWarehouseOperator(currentUser);
  const hqSalesView = isHqSalesManagerUser(currentUser);
  const weightSummary = order?.shipmentWeightSummary;

  const invoiceSent = Boolean(order?.branchInvoice?.sentToBranchAt);
  const canReceive =
    (order?.status === 'SHIPPED' || order?.status === 'SENT') &&
    !receiving &&
    !['RECEIVED', 'RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE', 'COMPLETED'].includes(order?.status ?? '');
  const showReceivingWorkspace =
    canReceive && canReceiveAtBranch && operatorView && Boolean(order?.receivingLineItems?.length);
  const showItemsTable = !showReceivingWorkspace;
  const showDeliveryCostSummary =
    showFinancials &&
    Boolean(order?.deliveryCostSummary && Number(order.deliveryCostSummary.transportCostKgs) > 0);
  const pickingProgress = order?.pickingProgress ?? { pickedCount: 0, totalCount: 0, remainingCount: 0 };
  const allItemsPicked = pickingProgress.totalCount > 0 && pickingProgress.remainingCount === 0;
  const showPickingControls = Boolean(canDispatch && order?.status === 'PICKING');
  const showPickedColumn = Boolean(canDispatch && order && ['PICKING', 'PACKED', 'SHIPPED', 'SENT'].includes(order.status));
  const showPickingProgress = Boolean(canDispatch && order?.status === 'PICKING' && pickingProgress.totalCount > 0);

  const pageContent = (
    <>
      <div>
        {!hqSalesView ? (
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t(distributionModuleTitleKey(currentUser))}
          </p>
        ) : null}
        <h2 className="text-3xl font-bold text-slate-950">{order?.orderNumber ?? '-'}</h2>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {order ? (
        <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-4">
                {shouldShowReceivingBranchField(operatorView) ? (
                  <Info label={t('distribution.branch')} value={order.branch?.name ?? ''} />
                ) : null}
                <Info label={t('distribution.sourceWarehouse')} value={order.sourceWarehouse?.name ?? ''} />
                <Info label={t('distribution.destinationWarehouse')} value={order.destinationWarehouse?.name ?? ''} />
                <Info label={t('distribution.status')} value={translateStatus(t, order.status, 'distribution')} />
                {showFinancials ? <Info label={t('distribution.totalAmount')} value={formatKgs(order.totalAmount)} /> : null}
                {showFinancials ? <Info label={t('distribution.totalCost')} value={formatKgs(order.totalCost)} /> : null}
                {showFinancials ? <Info label={t('distribution.totalProfit')} value={formatKgs(order.totalProfit)} /> : null}
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
                {order.status === 'PAID' && canApprove && invoiceSent ? (
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
                  <button
                    onClick={() => void action('pack', t('distribution.packed'))}
                    disabled={!allItemsPicked}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    type="button"
                    title={!allItemsPicked ? t('distribution.packBlockedNotAllPicked') : undefined}
                  >
                    {t('distribution.pack')}
                  </button>
                ) : null}
                {order.status === 'PACKED' && canDispatch ? (
                  <button onClick={() => void dispatchShipment()} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.send')}
                  </button>
                ) : null}
                {['RECEIVED', 'RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE'].includes(order.status) && canApprove ? (
                  <button onClick={() => void action('complete', t('distribution.orderCompleted'))} className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white" type="button">
                    {t('distribution.complete')}
                  </button>
                ) : null}
                {['DRAFT', 'INVOICED', 'PAYMENT_PENDING', 'PAID', 'SENT_TO_WAREHOUSE', 'PICKING', 'PACKED'].includes(order.status) && canCancel ? (
                  <button onClick={() => void action('cancel', t('distribution.orderCancelled'))} className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600" type="button">
                    {t('distribution.cancel')}
                  </button>
                ) : null}
              </div>
              {showPickingProgress ? (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">
                    {t('distribution.pickingProgress')
                      .replace('{picked}', String(pickingProgress.pickedCount))
                      .replace('{total}', String(pickingProgress.totalCount))}
                  </p>
                  {pickingProgress.remainingCount > 0 ? (
                    <p className="mt-1">
                      {t('distribution.pickingProgressRemaining').replace(
                        '{remaining}',
                        String(pickingProgress.remainingCount),
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
            {order.branchInvoice && showFinancials ? (
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
            {order.status === 'PACKED' && canDispatch ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-lg font-bold">{t('distribution.totalBatchWeight')}</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <Info label={t('distribution.totalBatchWeightPositions')} value={String(weightSummary?.lineCount ?? order.items?.length ?? 0)} />
                  <Info label={t('distribution.totalBatchWeightQuantity')} value={String(weightSummary?.totalQuantity ?? order.items?.reduce((sum, item) => sum + Number(item.dispatchedQuantity ?? item.quantity), 0) ?? 0)} />
                  <Info
                    label={t('distribution.totalBatchWeightCalculated')}
                    value={`${Number(weightSummary?.totalWeightKg ?? order.totalShipmentWeightKg ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${t('distribution.weightUnitKg')}`}
                  />
                </div>
                {shouldShowHqDispatchTransportFields() ? null : (
                  <p className="text-sm text-slate-600">{t('distribution.hqDispatchNoTransportHint')}</p>
                )}
              </section>
            ) : null}
            {(weightSummary || Number(order.totalShipmentWeightKg ?? 0) > 0) && !showFinancials && !(order.status === 'PACKED' && canDispatch) ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.totalBatchWeight')}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Info label={t('distribution.totalBatchWeightPositions')} value={String(weightSummary?.lineCount ?? order.items?.length ?? 0)} />
                  <Info label={t('distribution.totalBatchWeightQuantity')} value={String(weightSummary?.totalQuantity ?? 0)} />
                  <Info
                    label={t('distribution.totalBatchWeightCalculated')}
                    value={`${Number(weightSummary?.totalWeightKg ?? order.totalShipmentWeightKg ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${t('distribution.weightUnitKg')}`}
                  />
                </div>
              </section>
            ) : null}
            {showDeliveryCostSummary && order.deliveryCostSummary ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.deliveryCostSummary')}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Info label={t('distribution.deliveryCost')} value={formatKgs(order.deliveryCostSummary.transportCostKgs)} />
                  <Info label={t('distribution.shipmentWeight')} value={`${order.deliveryCostSummary.totalShipmentWeightKg.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} кг`} />
                  <Info label={t('distribution.costPerKg')} value={formatKgs(order.deliveryCostSummary.costPerKg)} />
                  <Info label={t('distribution.productCost')} value={formatKgs(order.deliveryCostSummary.productCostTotal)} />
                  <Info label={t('distribution.deliveryCostAllocated')} value={formatKgs(order.deliveryCostSummary.deliveryCostTotal)} />
                  <Info label={t('distribution.landedCost')} value={formatKgs(order.deliveryCostSummary.landedCostTotal)} />
                </div>
                {order.transportCompany ? <p className="mt-4 text-sm text-slate-600">{t('branchProductRequest.transportCompany')}: {order.transportCompany}</p> : null}
                {order.deliveryCostEnteredAt ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {t('distribution.deliveryCostEnteredAt')}: {new Date(order.deliveryCostEnteredAt).toLocaleString()}
                  </p>
                ) : null}
              </section>
            ) : null}
            {showItemsTable ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('distribution.items')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">{t('sales.product')}</th>
                      <th className="px-4 py-3">{t('distribution.quantity')}</th>
                      {showFinancials ? (
                        <>
                          <th className="px-4 py-3">{t('distribution.transferCost')}</th>
                          {showDeliveryCostSummary ? (
                            <>
                              <th className="px-4 py-3">{t('distribution.deliveryCostAllocated')}</th>
                              <th className="px-4 py-3">{t('distribution.landedUnitCost')}</th>
                            </>
                          ) : null}
                          <th className="px-4 py-3">{t('distribution.unitPrice')}</th>
                          <th className="px-4 py-3">{t('distribution.profit')}</th>
                        </>
                      ) : null}
                      {showPickedColumn ? <th className="px-4 py-3">{t('distribution.pick')}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items?.map((item) => {
                      const isPicked = Boolean(item.pickedAt);
                      const canPickItem = showPickingControls && Number(item.quantity) > 0;
                      return (
                      <tr key={item.id} className={isPicked ? 'bg-green-50' : undefined}>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.quantity}</td>
                        {showFinancials ? (
                          <>
                            <td className="px-4 py-3">{formatKgs(item.transferCostKgs ?? item.unitCost)}</td>
                            {showDeliveryCostSummary ? (
                              <>
                                <td className="px-4 py-3">{formatKgs(item.deliveryCostKgs ?? item.transportExpenseAllocation ?? 0)}</td>
                                <td className="px-4 py-3 font-semibold">{formatKgs(item.landedUnitCostKgs ?? item.unitCost)}</td>
                              </>
                            ) : null}
                            <td className="px-4 py-3">{formatKgs(item.unitPrice)}</td>
                            <td className="px-4 py-3">{formatKgs(item.profit)}</td>
                          </>
                        ) : null}
                        {showPickedColumn ? (
                          <td className="px-4 py-3">
                            {canPickItem && !isPicked ? (
                              <button
                                type="button"
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                                onClick={() => void setItemPicked(item.id, true)}
                              >
                                {t('distribution.itemPick')}
                              </button>
                            ) : null}
                            {isPicked ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800">
                                  {t('distribution.itemPickedDone')}
                                </span>
                                {canPickItem ? (
                                  <button
                                    type="button"
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                    onClick={() => void setItemPicked(item.id, false)}
                                  >
                                    {t('distribution.undoItemPick')}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </section>
            ) : null}
            {showReceivingWorkspace && order ? (
              <BranchReceivingWorkspace
                orderId={order.id}
                destinationWarehouseId={order.destinationWarehouseId}
                lineItems={order.receivingLineItems!}
                initialProgress={order.receivingProgress}
                initialTransportAllocationReady={order.transportAllocationReady}
                onAllocationSuccess={(result) => {
                  setOrder((current) =>
                    current
                      ? {
                          ...current,
                          transportAllocationReady: true,
                          deliveryCostEnteredAt: result.allocatedAt,
                          transportCostKgs: result.transportCostKgs,
                        }
                      : current,
                  );
                }}
                onCompleted={(result) => {
                  setReceiving(result.receiving);
                  setShortageReport(result.shortageReport);
                  setSuccess(
                    result.shortageReport
                      ? t('distribution.hasDifferences')
                      : t('distribution.branchReceivingCompletedSuccess'),
                  );
                  void load();
                }}
              />
            ) : null}
            {order && (canEnterTransport || operatorView) ? (
              <ReceivingTransportCostSection
                order={order}
                canEnter={canEnterTransport}
                onUpdated={(updated) => {
                  setOrder(updated);
                  setSuccess(t('branchWarehouseOperator.transportEntered'));
                }}
              />
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
    </>
  );

  return (
    <ProtectedShell>
      {hqSalesView ? (
        <HqSalesBranchOrdersSection>{pageContent}</HqSalesBranchOrdersSection>
      ) : (
        <section className="space-y-6">{pageContent}</section>
      )}
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}
function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
