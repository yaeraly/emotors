'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { BranchDistributionOrder } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="font-bold text-slate-950">{value}</p>
    </div>
  );
}

export function ReceivingTransportCostSection({
  order,
  canEnter,
  onUpdated,
}: {
  order: BranchDistributionOrder;
  canEnter: boolean;
  onUpdated: (order: BranchDistributionOrder) => void;
}) {
  const { t } = useTranslation();
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
  const [submitting, setSubmitting] = useState(false);

  const transportEntered = Boolean(Number(order.transportCostKgs ?? 0) > 0 || order.deliveryCostEnteredAt);
  const canShowTransportEntry =
    canEnter &&
    ['RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE', 'RECEIVED'].includes(order.status) &&
    !transportEntered;
  const showAllocationSummary = Boolean(
    order.deliveryCostSummary && Number(order.deliveryCostSummary.transportCostKgs) > 0,
  );

  async function submitTransportCost() {
    setSubmitting(true);
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
      onUpdated(updated);
      setSuccess(t('branchWarehouseOperator.transportEntered'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canShowTransportEntry && !showAllocationSummary) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {canShowTransportEntry ? (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('branchWarehouseOperator.transportExpenses')}</h3>
          <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.transportCompany')}</span>
              <input
                required
                value={transportForm.transportCompany}
                onChange={(event) => setTransportForm((current) => ({ ...current, transportCompany: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryMethod')}</span>
              <input
                value={transportForm.deliveryMethod}
                onChange={(event) => setTransportForm((current) => ({ ...current, deliveryMethod: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryCost')}</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={transportForm.transportCostKgs}
                onChange={(event) => setTransportForm((current) => ({ ...current, transportCostKgs: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('procurement.orders.currency')}</span>
              <input
                value={transportForm.currency}
                onChange={(event) => setTransportForm((current) => ({ ...current, currency: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.arrivalDate')}</span>
              <input
                type="date"
                required
                value={transportForm.deliveryDate}
                onChange={(event) => setTransportForm((current) => ({ ...current, deliveryDate: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.invoiceNumber')}</span>
              <input
                value={transportForm.documentNumber}
                onChange={(event) => setTransportForm((current) => ({ ...current, documentNumber: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryDocument')}</span>
              <input
                value={transportForm.deliveryDocument}
                onChange={(event) => setTransportForm((current) => ({ ...current, deliveryDocument: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
              <textarea
                value={transportForm.comment}
                onChange={(event) => setTransportForm((current) => ({ ...current, comment: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                rows={2}
              />
            </label>
          </div>
          <button
            onClick={() => void submitTransportCost()}
            disabled={submitting}
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
            type="button"
          >
            {submitting ? t('common.loading') : t('branchWarehouseOperator.confirmTransport')}
          </button>
        </section>
      ) : null}
      {showAllocationSummary && order.deliveryCostSummary ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('distribution.receivingTransportSection')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Info label={t('distribution.deliveryCost')} value={formatKgs(order.deliveryCostSummary.transportCostKgs)} />
            <Info
              label={t('distribution.shipmentWeight')}
              value={`${order.deliveryCostSummary.totalShipmentWeightKg.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${t('distribution.weightUnitKg')}`}
            />
            <Info label={t('distribution.deliveryCostAllocated')} value={formatKgs(order.deliveryCostSummary.deliveryCostTotal)} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
