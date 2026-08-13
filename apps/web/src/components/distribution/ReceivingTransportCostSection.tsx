'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { BranchDistributionOrder } from '@/lib/types';
import { buildBranchReceivingTransportPayload } from '@/lib/branch-receiving-ui';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

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

type PreviewAllocation = {
  productId: string;
  sku?: string;
  productName?: string;
  receivedQuantity: number;
  itemTotalWeightKg: number;
  hqTransferUnitCost: number;
  transportExpenseAllocation: number;
  transportCostPerUnit: number;
  finalUnitCostKgs: number;
};

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
    driverName: '',
    vehicleNumber: '',
    transportCostKgs: '',
    deliveryDate: new Date().toISOString().slice(0, 10),
    comment: '',
  });
  const [preview, setPreview] = useState<{
    totalShipmentWeightKg: number;
    transportCostKgs: number;
    allocatedTotal: number;
    allocations: PreviewAllocation[];
  } | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const transportEntered = Boolean(order.deliveryCostEnteredAt);
  const canShowTransportEntry =
    canEnter &&
    ['RECEIVED_BY_BRANCH', 'RECEIVED_WITH_DIFFERENCE', 'RECEIVED'].includes(order.status) &&
    !transportEntered;
  const showAllocationSummary = Boolean(order.deliveryCostSummary && transportEntered);

  const payload = useMemo(
    () => ({
      ...buildBranchReceivingTransportPayload({
        driverName: transportForm.driverName,
        vehicleNumber: transportForm.vehicleNumber,
        transportCostKgs: transportForm.transportCostKgs,
        transportNotes: transportForm.comment,
      }),
      deliveryDate: transportForm.deliveryDate || undefined,
      comment: transportForm.comment.trim() || undefined,
    }),
    [transportForm],
  );

  async function loadPreview() {
    setPreviewing(true);
    setError('');
    try {
      const result = await apiFetch<{
        totalShipmentWeightKg: number;
        transportCostKgs: number;
        allocatedTotal: number;
        allocations: PreviewAllocation[];
      }>(`/distribution/orders/${order.id}/transport-cost/preview`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setPreview(result);
    } catch (err) {
      setPreview(null);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPreviewing(false);
    }
  }

  async function submitTransportCost() {
    setSubmitting(true);
    setError('');
    /* toast clear */ void 0;
    try {
      const updated = await apiFetch<BranchDistributionOrder>(`/distribution/orders/${order.id}/transport-cost`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onUpdated(updated);
      toast.success(t('branchWarehouseOperator.transportEntered'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
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
      {canShowTransportEntry ? (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold">{t('branchWarehouseOperator.transportExpenses')}</h3>
          <p className="text-sm text-slate-600">{t('distribution.transportCostZeroAllowed')}</p>
          <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.driverName')}</span>
              <input
                value={transportForm.driverName}
                onChange={(event) => setTransportForm((current) => ({ ...current, driverName: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.vehicleNumber')}</span>
              <input
                value={transportForm.vehicleNumber}
                onChange={(event) => setTransportForm((current) => ({ ...current, vehicleNumber: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryCost')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={transportForm.transportCostKgs}
                onChange={(event) => setTransportForm((current) => ({ ...current, transportCostKgs: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{t('distribution.arrivalDate')}</span>
              <input
                type="date"
                value={transportForm.deliveryDate}
                onChange={(event) => setTransportForm((current) => ({ ...current, deliveryDate: event.target.value }))}
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
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void loadPreview()}
              disabled={previewing}
              className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-800 disabled:opacity-50"
              type="button"
            >
              {previewing ? t('common.loading') : t('distribution.transportAllocationPreview')}
            </button>
            <button
              onClick={() => void submitTransportCost()}
              disabled={submitting}
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300"
              type="button"
            >
              {submitting ? t('common.loading') : t('branchWarehouseOperator.confirmTransport')}
            </button>
          </div>
          {preview ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Info label={t('distribution.shipmentTotalWeight')} value={`${preview.totalShipmentWeightKg} ${t('distribution.weightUnitKg')}`} />
                <Info label={t('distribution.deliveryCost')} value={formatKgs(preview.transportCostKgs)} />
                <Info label={t('distribution.deliveryCostAllocated')} value={formatKgs(preview.allocatedTotal)} />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">{t('distribution.hqTransferCost')}</th>
                      <th className="px-3 py-2">{t('distribution.allocatedTransportCost')}</th>
                      <th className="px-3 py-2">{t('distribution.finalBranchInventoryCost')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.allocations.map((row) => (
                      <tr key={row.productId}>
                        <td className="px-3 py-2">{row.sku ?? row.productId}</td>
                        <td className="px-3 py-2">{formatKgs(row.hqTransferUnitCost)}</td>
                        <td className="px-3 py-2">{formatKgs(row.transportExpenseAllocation)}</td>
                        <td className="px-3 py-2 font-semibold">{formatKgs(row.finalUnitCostKgs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
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
          {order.driverName ? (
            <p className="text-sm text-slate-600">
              {t('branchProductRequest.driverName')}: {order.driverName}
            </p>
          ) : null}
          {order.vehicleNumber ? (
            <p className="text-sm text-slate-600">
              {t('branchProductRequest.vehicleNumber')}: {order.vehicleNumber}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
