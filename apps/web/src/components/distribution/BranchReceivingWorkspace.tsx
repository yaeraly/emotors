'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useBranchReceivingDraft } from '@/hooks/useBranchReceivingDraft';
import {
  rowBackgroundClass,
  type BranchReceivingLineItem,
  type BranchReceivingProgress,
} from '@/lib/branch-receiving-draft';
import {
  allocationResponseIsBranchSafe,
  buildBranchReceivingTransportPayload,
  BRANCH_RECEIVING_PRODUCT_NAME_CELL_CLASS,
  BRANCH_RECEIVING_QUANTITY_HEADER_KEYS,
  canCompleteBranchReceiving,
  COMPLETE_RECEIVING_REQUIRES_ALLOCATION,
  TRANSPORT_ALLOCATION_SUCCESS_MESSAGE,
  TRANSPORT_COST_EMPTY_MESSAGE,
  validateTransportCostInput,
  type BranchReceivingTransportFormState,
  type BranchWarehouseTransportAllocationResult,
} from '@/lib/branch-receiving-ui';
import { useTranslation } from '@/i18n/useTranslation';
import type { GoodsReceiving, ShortageReport } from '@/lib/types';

type BranchReceivingWorkspaceProps = {
  orderId: string;
  destinationWarehouseId: string;
  lineItems: BranchReceivingLineItem[];
  initialProgress?: BranchReceivingProgress;
  initialTransportAllocationReady?: boolean;
  readOnly?: boolean;
  onAllocationSuccess?: (result: BranchWarehouseTransportAllocationResult) => void;
  onCompleted?: (result: {
    receiving: GoodsReceiving;
    shortageReport: ShortageReport | null;
  }) => void;
};

export function BranchReceivingWorkspace({
  orderId,
  destinationWarehouseId,
  lineItems,
  initialProgress,
  initialTransportAllocationReady = false,
  readOnly = false,
  onAllocationSuccess,
  onCompleted,
}: BranchReceivingWorkspaceProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<BranchReceivingProgress | undefined>(initialProgress);
  const [saveToast, setSaveToast] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [transportAllocationReady, setTransportAllocationReady] = useState(
    initialTransportAllocationReady,
  );
  const [allocationResult, setAllocationResult] =
    useState<BranchWarehouseTransportAllocationResult | null>(null);
  const [transportCostError, setTransportCostError] = useState('');
  const [transportForm, setTransportForm] = useState<BranchReceivingTransportFormState>({
    driverName: '',
    vehicleNumber: '',
    transportCostKgs: '',
    transportNotes: '',
  });

  const canEdit = !readOnly && !completed;

  const {
    rows,
    progress: draftProgress,
    unsavedCount,
    allSaved,
    saveRow,
    updateRow,
  } = useBranchReceivingDraft({
    orderId,
    lineItems,
    readOnly,
    enabled: canEdit,
    onProgressUpdated: setProgress,
  });

  const displayProgress = progress ?? draftProgress;

  const showComplete = canCompleteBranchReceiving({
    allSaved,
    products: displayProgress.products,
    checked: displayProgress.checked,
    transportAllocationReady,
    receiptCompleted: completed,
  });

  const quantitiesReady = allSaved && displayProgress.products > 0 && displayProgress.checked === displayProgress.products;

  function invalidateTransportAllocation() {
    setTransportAllocationReady(false);
    setAllocationResult(null);
  }

  function updateTransportForm(
    updater: (current: BranchReceivingTransportFormState) => BranchReceivingTransportFormState,
  ) {
    invalidateTransportAllocation();
    setTransportForm(updater);
  }

  const handleSaveRow = useCallback(
    async (itemId: string) => {
      const ok = await saveRow(itemId);
      if (ok) {
        invalidateTransportAllocation();
        setSaveToast(t('chinaReceiving.saveState.saved'));
        setTimeout(() => setSaveToast(''), 2000);
      } else {
        setError(t('common.error'));
      }
    },
    [saveRow, t],
  );

  useEffect(() => {
    const hasDirtyRows = Object.values(rows).some(
      (row) => row.isDirty || row.saveState === 'unsaved' || row.saveState === 'error',
    );
    if (hasDirtyRows && transportAllocationReady) {
      invalidateTransportAllocation();
    }
  }, [rows, transportAllocationReady]);

  function transportPayload() {
    const validated = validateTransportCostInput(transportForm.transportCostKgs);
    if (!validated.ok) {
      throw new Error(validated.message);
    }
    return buildBranchReceivingTransportPayload(transportForm);
  }

  async function allocateTransportCost() {
    setError('');
    setTransportCostError('');
    setPreviewing(true);
    try {
      const validated = validateTransportCostInput(transportForm.transportCostKgs);
      if (!validated.ok) {
        setTransportCostError(validated.message);
        return;
      }
      const payload = transportPayload();
      const result = await apiFetch<BranchWarehouseTransportAllocationResult>(
        `/distribution/orders/${orderId}/transport-cost/allocate`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      if (!allocationResponseIsBranchSafe(result)) {
        throw new Error(t('common.error'));
      }
      setAllocationResult(result);
      setTransportAllocationReady(true);
      setSaveToast(TRANSPORT_ALLOCATION_SUCCESS_MESSAGE);
      setTimeout(() => setSaveToast(''), 4000);
      onAllocationSuccess?.(result);
    } catch (err) {
      setAllocationResult(null);
      setTransportAllocationReady(false);
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPreviewing(false);
    }
  }

  async function completeReceiving() {
    if (!showComplete) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<{
        receiving: GoodsReceiving;
        shortageReport: ShortageReport | null;
      }>(`/distribution/orders/${orderId}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: destinationWarehouseId,
          note: '',
          driverName: transportForm.driverName.trim() || undefined,
          vehicleNumber: transportForm.vehicleNumber.trim() || undefined,
          transportNotes: transportForm.transportNotes.trim() || undefined,
        }),
      });
      setCompleted(true);
      onCompleted?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      <h3 className="text-lg font-bold">{t('distribution.receiveGoods')}</h3>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {saveToast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {saveToast}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label={t('chinaReceiving.summary.products')} value={String(displayProgress.products)} />
        <SummaryCard
          label={t('chinaReceiving.progressChecked')}
          value={`${displayProgress.checked} / ${displayProgress.products}`}
        />
        <SummaryCard label={t('chinaReceiving.progressRemaining')} value={String(displayProgress.remaining)} />
        <SummaryCard
          label={t('distribution.difference')}
          value={String(displayProgress.discrepancyLines)}
          tone="amber"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">{t('chinaReceiving.progressTitle')}</p>
            <p className="text-lg font-bold text-slate-950">
              {t('distribution.receivingProgressAccepted')
                .replace('{accepted}', String(displayProgress.checked))
                .replace('{total}', String(displayProgress.products))}
            </p>
            <p className="text-sm text-slate-600">
              {t('chinaReceiving.progressPercent').replace('{value}', String(displayProgress.progress))}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>{t('chinaReceiving.summary.shortage')}: {displayProgress.shortage}</span>
            <span>{t('chinaReceiving.summary.damaged')}: {displayProgress.damaged}</span>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${displayProgress.progress}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[44rem] table-auto divide-y divide-slate-200 text-xs">
          <colgroup>
            <col className="w-[4.5rem]" />
            <col />
            <col className="w-[4.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[3.5rem]" />
            <col className="w-[7rem]" />
            {canEdit ? <col className="w-[4.5rem]" /> : null}
          </colgroup>
          <thead className="bg-slate-50 text-left font-bold text-slate-500">
            <tr>
              <th className="px-2 py-2">SKU</th>
              <th className="min-w-[10rem] px-2 py-2">{t('sales.product')}</th>
              <th className="px-2 py-2 text-center">{t(BRANCH_RECEIVING_QUANTITY_HEADER_KEYS.sentQuantity)}</th>
              <th className="px-2 py-2 text-center">{t(BRANCH_RECEIVING_QUANTITY_HEADER_KEYS.acceptedQuantity)}</th>
              <th className="px-2 py-2 text-center">{t('distribution.damagedQuantity')}</th>
              <th className="px-2 py-2 text-center">{t('distribution.difference')}</th>
              <th className="px-2 py-2">{t('crm.notes')}</th>
              {canEdit ? <th className="px-2 py-2 text-center">{t('chinaReceiving.col.actionsShort')}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lineItems.map((item) => {
              const row = rows[item.id];
              const accepted = Number(row?.acceptedQuantity ?? item.expectedQuantity);
              const damaged = Number(row?.damagedQuantity ?? 0);
              const diff = accepted - item.expectedQuantity;
              const rowStatus = row?.rowStatus ?? 'IN_PROGRESS';
              const bg = row ? rowBackgroundClass(rowStatus, row.saveState, row.isDirty) : '';
              const isLocked = row?.serverIsSaved && !row.isDirty;

              return (
                <tr key={item.id} className={bg}>
                  <td className="px-2 py-2 align-top whitespace-nowrap">{item.sku}</td>
                  <td className="min-w-[10rem] px-2 py-2 align-top">
                    <p className={BRANCH_RECEIVING_PRODUCT_NAME_CELL_CLASS}>{item.productName}</p>
                    <p className="text-[10px] text-slate-500">{item.unit}</p>
                  </td>
                  <td className="px-2 py-2 text-center align-top">{item.expectedQuantity}</td>
                  <td className="px-2 py-2 align-top">
                    {canEdit && !isLocked ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.acceptedQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'acceptedQuantity', e.target.value)}
                        className="w-full min-w-[3rem] rounded border border-slate-300 px-1.5 py-1 text-center"
                      />
                    ) : (
                      <span className="block text-center">{accepted}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {canEdit && !isLocked ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.damagedQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'damagedQuantity', e.target.value)}
                        className="w-full min-w-[3rem] rounded border border-slate-300 px-1.5 py-1 text-center"
                      />
                    ) : (
                      <span className="block text-center">{damaged}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center align-top font-semibold">{diff}</td>
                  <td className="px-2 py-2 align-top">
                    {canEdit && !isLocked ? (
                      <input
                        value={row?.note ?? ''}
                        onChange={(e) => updateRow(item.id, 'note', e.target.value)}
                        className="w-full rounded border border-slate-300 px-1.5 py-1"
                        placeholder={t('crm.notes')}
                      />
                    ) : (
                      <span className="block truncate">{row?.note || '-'}</span>
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-2 py-2 text-center align-top">
                      {!isLocked ? (
                        <button
                          type="button"
                          disabled={row?.saveState === 'saving'}
                          onClick={() => void handleSaveRow(item.id)}
                          className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          {row?.saveState === 'saving'
                            ? t('chinaReceiving.saveState.saving')
                            : t('common.save')}
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <h4 className="text-base font-bold text-slate-950">{t('branchWarehouseOperator.transportExpenses')}</h4>
            <p className="mt-1 text-sm text-slate-600">{t('distribution.transportCostZeroAllowed')}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.driverName')}</span>
                <input
                  value={transportForm.driverName}
                  onChange={(e) => updateTransportForm((c) => ({ ...c, driverName: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('branchProductRequest.vehicleNumber')}</span>
                <input
                  value={transportForm.vehicleNumber}
                  onChange={(e) => updateTransportForm((c) => ({ ...c, vehicleNumber: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t('distribution.deliveryCost')}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={transportForm.transportCostKgs}
                  onChange={(e) => {
                    setTransportCostError('');
                    updateTransportForm((c) => ({ ...c, transportCostKgs: e.target.value }));
                  }}
                  className={`mt-2 w-full rounded-xl border px-3 py-2 ${
                    transportCostError ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                  }`}
                />
                {transportCostError ? (
                  <p className="mt-2 whitespace-pre-line text-sm text-amber-800">{transportCostError}</p>
                ) : null}
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">{t('crm.notes')}</span>
                <textarea
                  value={transportForm.transportNotes}
                  onChange={(e) => updateTransportForm((c) => ({ ...c, transportNotes: e.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                  rows={2}
                />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {!allSaved ? (
              <p className="w-full rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t('chinaReceiving.unsavedBlock').replace('{count}', String(unsavedCount))}
              </p>
            ) : null}
            {!completed ? (
              <>
                <button
                  type="button"
                  disabled={previewing || !allSaved}
                  onClick={() => void allocateTransportCost()}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 disabled:opacity-50"
                >
                  {previewing ? t('common.loading') : t('distribution.transportAllocationPreview')}
                </button>
                <button
                  type="button"
                  disabled={submitting || !showComplete}
                  onClick={() => void completeReceiving()}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? t('common.loading') : t('distribution.completeReceiving')}
                </button>
              </>
            ) : null}
            {!showComplete && quantitiesReady && !completed ? (
              <p className="w-full text-sm text-slate-600">{COMPLETE_RECEIVING_REQUIRES_ALLOCATION}</p>
            ) : null}
          </div>
          {allocationResult ? (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="whitespace-pre-line text-sm font-semibold text-emerald-900">
                {allocationResult.message || TRANSPORT_ALLOCATION_SUCCESS_MESSAGE}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <SummaryCard
                  label={t('distribution.deliveryCost')}
                  value={`${Number(allocationResult.transportCostKgs).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сом`}
                />
                <SummaryCard
                  label={t('distribution.shipmentTotalWeight')}
                  value={`${allocationResult.totalShipmentWeightKg} ${t('distribution.weightUnitKg')}`}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'amber';
}) {
  const toneClass = tone === 'amber' ? 'text-amber-700' : 'text-slate-950';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
