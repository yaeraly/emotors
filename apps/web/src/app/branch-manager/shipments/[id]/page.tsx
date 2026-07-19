'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canEnterBranchTransportCost } from '@/lib/rbac';
import type { BranchDistributionOrder, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
}

export default function BranchManagerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<BranchDistributionOrder | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transportForm, setTransportForm] = useState({
    transportCompany: '',
    deliveryMethod: '',
    transportCostKgs: '',
    currency: 'KGS',
    deliveryDate: new Date().toISOString().slice(0, 10),
    documentNumber: '',
    deliveryDocument: '',
    comment: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingTransport, setSubmittingTransport] = useState(false);

  async function load() {
    const [result, me] = await Promise.all([
      apiFetch<BranchDistributionOrder>(`/distribution/orders/${id}`),
      apiFetch<User>('/auth/me'),
    ]);
    setOrder(result);
    setCurrentUser(me);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  async function submitTransportCost() {
    if (!order) return;
    setSubmittingTransport(true);
    setError('');
    setSuccess('');
    try {
      const updated = await apiFetch<BranchDistributionOrder>(`/distribution/orders/${order.id}/transport-cost`, {
        method: 'POST',
        body: JSON.stringify({
          transportCompany: transportForm.transportCompany.trim(),
          deliveryMethod: transportForm.deliveryMethod.trim() || undefined,
          transportCostKgs: Number(transportForm.transportCostKgs || 0),
          currency: transportForm.currency || 'KGS',
          deliveryDate: transportForm.deliveryDate,
          documentNumber: transportForm.documentNumber.trim() || undefined,
          deliveryDocument: transportForm.deliveryDocument.trim() || undefined,
          comment: transportForm.comment.trim() || undefined,
        }),
      });
      setOrder(updated);
      setSuccess(t('branchManager.transportEntered'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmittingTransport(false);
    }
  }

  const canEnterTransport = canEnterBranchTransportCost(currentUser);
  const weightSummary = order?.shipmentWeightSummary;
  const transportEntered = Boolean(order && (Number(order.transportCostKgs ?? 0) > 0 || order.deliveryCostEnteredAt));
  const canShowTransportEntry =
    Boolean(order) &&
    canEnterTransport &&
    ['RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE', 'RECEIVED'].includes(order!.status) &&
    !transportEntered;
  const showDeliveryCostSummary =
    Boolean(order?.deliveryCostSummary && Number(order.deliveryCostSummary.transportCostKgs) > 0);

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
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
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
                <Info label={t('common.createdDate')} value={new Date(order.createdAt).toLocaleString()} />
              </div>
            </section>
            {canShowTransportEntry ? (
              <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('branchManager.transportExpenses')}</h3>
                <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.transportCompany')}</span>
                    <input required value={transportForm.transportCompany} onChange={(event) => setTransportForm((current) => ({ ...current, transportCompany: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryMethod')}</span>
                    <input value={transportForm.deliveryMethod} onChange={(event) => setTransportForm((current) => ({ ...current, deliveryMethod: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryCost')}</span>
                    <input type="number" min="0.01" step="0.01" required value={transportForm.transportCostKgs} onChange={(event) => setTransportForm((current) => ({ ...current, transportCostKgs: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('procurement.orders.currency')}</span>
                    <input value={transportForm.currency} onChange={(event) => setTransportForm((current) => ({ ...current, currency: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('distribution.arrivalDate')}</span>
                    <input type="date" required value={transportForm.deliveryDate} onChange={(event) => setTransportForm((current) => ({ ...current, deliveryDate: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">{t('distribution.invoiceNumber')}</span>
                    <input value={transportForm.documentNumber} onChange={(event) => setTransportForm((current) => ({ ...current, documentNumber: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryDocument')}</span>
                    <input value={transportForm.deliveryDocument} onChange={(event) => setTransportForm((current) => ({ ...current, deliveryDocument: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
                    <textarea value={transportForm.comment} onChange={(event) => setTransportForm((current) => ({ ...current, comment: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" rows={2} />
                  </label>
                </div>
                <button
                  onClick={() => void submitTransportCost()}
                  disabled={submittingTransport}
                  className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
                  type="button"
                >
                  {submittingTransport ? t('common.loading') : t('branchManager.confirmTransport')}
                </button>
              </section>
            ) : null}
            {showDeliveryCostSummary && order.deliveryCostSummary ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">{t('distribution.deliveryCostSummary')}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Info label={t('distribution.deliveryCost')} value={formatKgs(order.deliveryCostSummary.transportCostKgs)} />
                  <Info label={t('distribution.shipmentWeight')} value={`${order.deliveryCostSummary.totalShipmentWeightKg.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} кг`} />
                  <Info label={t('distribution.costPerKg')} value={formatKgs(order.deliveryCostSummary.costPerKg)} />
                  <Info label={t('distribution.deliveryCostAllocated')} value={formatKgs(order.deliveryCostSummary.deliveryCostTotal)} />
                  <Info label={t('distribution.landedCost')} value={formatKgs(order.deliveryCostSummary.landedCostTotal)} />
                </div>
              </section>
            ) : null}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('distribution.items')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">{t('sales.product')}</th>
                      <th className="px-4 py-3">{t('distribution.quantity')}</th>
                      {showDeliveryCostSummary ? (
                        <>
                          <th className="px-4 py-3">{t('distribution.deliveryCostAllocated')}</th>
                          <th className="px-4 py-3">{t('distribution.landedUnitCost')}</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.quantity}</td>
                        {showDeliveryCostSummary ? (
                          <>
                            <td className="px-4 py-3">{formatKgs(item.transportExpenseAllocation)}</td>
                            <td className="px-4 py-3">{formatKgs(item.landedUnitCostKgs)}</td>
                          </>
                        ) : null}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
