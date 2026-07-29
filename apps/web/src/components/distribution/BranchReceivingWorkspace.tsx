'use client';

import { useCallback, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useBranchReceivingDraft } from '@/hooks/useBranchReceivingDraft';
import {
  rowBackgroundClass,
  type BranchReceivingLineItem,
  type BranchReceivingProgress,
} from '@/lib/branch-receiving-draft';
import { useTranslation } from '@/i18n/useTranslation';
import type { GoodsReceiving, ShortageReport } from '@/lib/types';

type BranchReceivingWorkspaceProps = {
  orderId: string;
  destinationWarehouseId: string;
  lineItems: BranchReceivingLineItem[];
  initialProgress?: BranchReceivingProgress;
  canCompleteReceiving?: boolean;
  readOnly?: boolean;
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
  canCompleteReceiving = false,
  readOnly = false,
  onCompleted,
}: BranchReceivingWorkspaceProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<BranchReceivingProgress | undefined>(initialProgress);
  const [saveToast, setSaveToast] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canEdit = !readOnly;

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

  const showComplete = canCompleteReceiving && allSaved && displayProgress.products > 0;

  const handleSaveRow = useCallback(
    async (itemId: string) => {
      const ok = await saveRow(itemId);
      if (ok) {
        setSaveToast(t('chinaReceiving.saveState.saved'));
        setTimeout(() => setSaveToast(''), 2000);
      } else {
        setError(t('common.error'));
      }
    },
    [saveRow, t],
  );

  async function completeReceiving() {
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
        }),
      });
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
        <table className="w-full table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-bold text-slate-500">
            <tr>
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2">{t('sales.product')}</th>
              <th className="px-2 py-2">{t('distribution.sentQuantity')}</th>
              <th className="px-2 py-2">{t('distribution.acceptedQuantity')}</th>
              <th className="px-2 py-2">{t('distribution.damagedQuantity')}</th>
              <th className="px-2 py-2">{t('distribution.missingQuantity')}</th>
              <th className="px-2 py-2">{t('distribution.difference')}</th>
              <th className="px-2 py-2">{t('crm.notes')}</th>
              <th className="px-2 py-2">{t('distribution.status')}</th>
              {canEdit ? <th className="w-24 px-2 py-2">{t('chinaReceiving.col.actionsShort')}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lineItems.map((item) => {
              const row = rows[item.id];
              const accepted = Number(row?.acceptedQuantity ?? item.expectedQuantity);
              const damaged = Number(row?.damagedQuantity ?? 0);
              const missing = Number(row?.missingQuantity ?? 0);
              const diff = accepted - item.expectedQuantity;
              const rowStatus = row?.rowStatus ?? 'IN_PROGRESS';
              const bg = row ? rowBackgroundClass(rowStatus, row.saveState, row.isDirty) : '';
              const isLocked = row?.serverIsSaved && !row.isDirty;

              return (
                <tr key={item.id} className={bg}>
                  <td className="px-2 py-2">{item.sku}</td>
                  <td className="px-2 py-2">
                    <p className="truncate font-medium text-slate-900" title={item.productName}>
                      {item.productName}
                    </p>
                    <p className="text-[10px] text-slate-500">{item.unit}</p>
                  </td>
                  <td className="px-2 py-2 text-center">{item.expectedQuantity}</td>
                  <td className="px-2 py-2">
                    {canEdit && !isLocked ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.acceptedQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'acceptedQuantity', e.target.value)}
                        className="w-full rounded border border-slate-300 px-1.5 py-1 text-center"
                      />
                    ) : (
                      <span className="block text-center">{accepted}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canEdit && !isLocked ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.damagedQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'damagedQuantity', e.target.value)}
                        className="w-full rounded border border-slate-300 px-1.5 py-1 text-center"
                      />
                    ) : (
                      <span className="block text-center">{damaged}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canEdit && !isLocked ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.missingQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'missingQuantity', e.target.value)}
                        className="w-full rounded border border-slate-300 px-1.5 py-1 text-center"
                      />
                    ) : (
                      <span className="block text-center">{missing}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center font-semibold">{diff}</td>
                  <td className="px-2 py-2">
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
                  <td className="px-2 py-2 text-center text-[11px] font-semibold">
                    {isLocked ? t('chinaReceiving.saveState.saved') : t('chinaReceiving.saveState.unsaved')}
                  </td>
                  {canEdit ? (
                    <td className="px-2 py-2">
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
        <div className="flex flex-wrap gap-3">
          {!allSaved ? (
            <p className="w-full rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t('chinaReceiving.unsavedBlock').replace('{count}', String(unsavedCount))}
            </p>
          ) : null}
          <button
            type="button"
            disabled={submitting || !showComplete}
            onClick={() => void completeReceiving()}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t('common.loading') : t('distribution.completeReceiving')}
          </button>
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
