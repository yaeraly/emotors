'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { canReceiveProcurementToHq, hasFullAccess } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';
import { useChinaReceivingDraft } from '@/hooks/useChinaReceivingDraft';
import {
  differenceDisplay,
  formatSaveTime,
  rowBackgroundClass,
  type ChinaReceivingLineItem,
  type ChinaReceivingProgress,
  type ChinaReceivingRowStatus,
  type LocalRowState,
} from '@/lib/china-receiving-draft';

type EditSession = {
  lockedByUserId: string;
  lockedByUser: { id: string; fullName: string };
  isCurrentUser: boolean;
  canTakeOver: boolean;
};

export type ChinaReceivingDetail = {
  id: string;
  orderNumber: string;
  purchaseDate?: string | null;
  supplyManager?: { id: string; fullName: string } | null;
  hqWarehouseId: string;
  hqWarehouse?: { id: string; name: string; isActive: boolean };
  receivingStatus: string;
  draftState?: 'DRAFT' | 'COMPLETED';
  canReceive: boolean;
  hqStockMovementCreatedAt?: string | null;
  lineItems: ChinaReceivingLineItem[];
  progress?: ChinaReceivingProgress;
  editSession?: EditSession | null;
  readOnly?: boolean;
  shipmentBatches?: Array<{
    id: string;
    receivingNumber: string;
    receivedAt: string;
    items: Array<{
      id: string;
      productName: string;
      sku: string;
      expectedQuantity: number;
      actualQuantity: number;
      difference: number;
    }>;
    discrepancyActs: Array<{
      id: string;
      actNumber: string;
      sku: string;
      status: string;
    }>;
  }>;
};

function formatOrderDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ru-RU');
}

function statusLabel(t: (key: string) => string, status: ChinaReceivingRowStatus) {
  switch (status) {
    case 'ACCEPTED':
      return t('chinaReceiving.status.accepted');
    case 'IN_PROGRESS':
      return t('chinaReceiving.status.inProgress');
    case 'SHORTAGE':
      return t('chinaReceiving.status.shortage');
    case 'OVERAGE':
      return t('chinaReceiving.status.overage');
    case 'DAMAGED':
      return t('chinaReceiving.status.damaged');
    default:
      return status;
  }
}

function saveStateLabel(t: (key: string) => string, state: LocalRowState['saveState']) {
  switch (state) {
    case 'saved':
      return t('chinaReceiving.saveState.saved');
    case 'saving':
      return t('chinaReceiving.saveState.saving');
    case 'error':
      return t('chinaReceiving.saveState.error');
    default:
      return t('chinaReceiving.saveState.unsaved');
  }
}

export function ChinaReceivingWorkspace({
  task,
  user,
  onReload,
}: {
  task: ChinaReceivingDetail;
  user: User;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const isCompleted = Boolean(task.hqStockMovementCreatedAt);
  const readOnly = Boolean(task.readOnly) || isCompleted || !canReceiveProcurementToHq(user);
  const canEdit = canReceiveProcurementToHq(user) && !isCompleted && !readOnly;
  const isCeo = hasFullAccess(user);

  const {
    rows,
    progress,
    unsavedCount,
    allSaved,
    savingAll,
    networkOffline,
    updateRow,
    saveRow,
    saveAll,
    clearDraftAfterComplete,
  } = useChinaReceivingDraft({
    orderId: task.id,
    lineItems: task.lineItems,
    readOnly: !canEdit,
    enabled: !isCompleted,
    onSessionExpired: () => {
      setSessionExpired(true);
      setShowLoginPrompt(true);
    },
    onNetworkRecovery: () => setError(''),
  });

  const displayProgress = progress.products > 0 ? progress : task.progress ?? progress;

  const hasDifference = useMemo(() => {
    return task.lineItems.some((item) => {
      const row = rows[item.id];
      if (!row) return false;
      const actual = Number(row.actualQuantity) || 0;
      const damaged = Number(row.damagedQuantity) || 0;
      return actual !== item.expectedQuantity || damaged > 0;
    });
  }, [task.lineItems, rows]);

  async function takeOverSession() {
    try {
      await apiFetch(`/procurement/china-receiving/${task.id}/session/take-over`, { method: 'POST' });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function receiveToHq() {
    if (!canEdit || !allSaved) return;
    setLoading(true);
    setError('');
    try {
      await apiFetch(`/procurement/orders/${task.id}/receive-to-hq`, {
        method: 'POST',
        body: JSON.stringify({
          hqWarehouseId: task.hqWarehouseId,
          items: task.lineItems.map((item) => {
            const row = rows[item.id];
            return {
              procurementItemId: item.id,
              receivedQuantity: Number(row?.actualQuantity ?? item.expectedQuantity),
              damagedQuantity: Number(row?.damagedQuantity ?? 0),
              note: row?.note || undefined,
              shortageReason:
                Number(row?.actualQuantity ?? item.expectedQuantity) !== item.expectedQuantity
                  ? 'OTHER'
                  : Number(row?.damagedQuantity ?? 0) > 0
                    ? 'DAMAGED_GOODS'
                    : undefined,
            };
          }),
        }),
      });
      clearDraftAfterComplete();
      window.localStorage.setItem('emotors_china_receiving_success', t('chinaReceiving.receivedSuccess'));
      router.push('/hq-warehouses/china-receiving');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('chinaReceiving.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{task.orderNumber}</h2>
          <p className="text-sm text-slate-500">
            {task.hqWarehouse?.name} · {translateStatus(t, task.receivingStatus, 'procurement')}
            {task.draftState === 'DRAFT' ? ` · ${t('chinaReceiving.draftState')}` : ''}
          </p>
        </div>
        <Link href="/hq-warehouses/china-receiving" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
          {t('common.back')}
        </Link>
      </div>

      {task.editSession && !task.editSession.isCurrentUser ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">{t('chinaReceiving.sessionLocked')}</p>
          <p>
            {t('chinaReceiving.sessionLockedBy')}: {task.editSession.lockedByUser.fullName}
          </p>
          <p className="mt-1 text-amber-800">{t('chinaReceiving.readOnlyMode')}</p>
          {isCeo && task.editSession.canTakeOver ? (
            <button
              type="button"
              onClick={() => void takeOverSession()}
              className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
            >
              {t('chinaReceiving.takeOver')}
            </button>
          ) : null}
        </div>
      ) : null}

      {networkOffline ? (
        <p className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
          {t('chinaReceiving.networkOffline')}
        </p>
      ) : null}

      {sessionExpired && showLoginPrompt ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {t('chinaReceiving.sessionExpired')}
        </p>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {hasDifference && canEdit ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {t('chinaReceiving.differenceAutoWarning')}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label={t('chinaReceiving.summary.products')} value={String(displayProgress.products)} />
        <SummaryCard label={t('chinaReceiving.summary.expectedQty')} value={String(displayProgress.expectedQty)} />
        <SummaryCard label={t('chinaReceiving.summary.receivedQty')} value={String(displayProgress.receivedQty)} />
        <SummaryCard label={t('chinaReceiving.summary.shortage')} value={String(displayProgress.shortage)} tone="red" />
        <SummaryCard label={t('chinaReceiving.summary.overage')} value={String(displayProgress.overage)} tone="green" />
        <SummaryCard label={t('chinaReceiving.summary.damaged')} value={String(displayProgress.damaged)} tone="orange" />
        <SummaryCard label={t('chinaReceiving.summary.checked')} value={String(displayProgress.checked)} />
        <SummaryCard label={t('chinaReceiving.summary.remaining')} value={String(displayProgress.remaining)} />
        <SummaryCard label={t('chinaReceiving.summary.saved')} value={String(displayProgress.saved)} tone="green" />
        <SummaryCard label={t('chinaReceiving.summary.unsaved')} value={String(unsavedCount)} tone="amber" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">{t('chinaReceiving.progressTitle')}</p>
            <p className="text-lg font-bold text-slate-950">
              {t('chinaReceiving.progressPercent').replace('{value}', String(displayProgress.progress))}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>{t('chinaReceiving.progressChecked')}: {displayProgress.checked}</span>
            <span>{t('chinaReceiving.progressRemaining')}: {displayProgress.remaining}</span>
            <span>{t('chinaReceiving.progressSaved')}: {displayProgress.saved}</span>
            <span>{t('chinaReceiving.progressUnsaved')}: {unsavedCount}</span>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${displayProgress.progress}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Info label={t('chinaReceiving.purchaseDate')} value={formatOrderDate(task.purchaseDate)} />
        <Info label={t('chinaReceiving.orderNumber')} value={task.orderNumber} />
        <Info
          label={t('chinaReceiving.supplyManager')}
          value={task.supplyManager?.fullName ?? t('chinaReceiving.supplyManagerNotAssigned')}
        />
        <Info label={t('chinaReceiving.targetWarehouse')} value={task.hqWarehouse?.name ?? '-'} />
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={savingAll || unsavedCount === 0}
            onClick={() => void saveAll()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {savingAll ? t('chinaReceiving.saveState.saving') : t('chinaReceiving.saveAll')}
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">{t('chinaReceiving.col.product')}</th>
              <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
              <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
              <th className="px-4 py-3">{t('chinaReceiving.damagedQty')}</th>
              <th className="px-4 py-3">{t('chinaReceiving.difference')}</th>
              <th className="px-4 py-3">{t('chinaReceiving.col.status')}</th>
              <th className="px-4 py-3">{t('chinaReceiving.saveStatus')}</th>
              <th className="px-4 py-3">{t('chinaReceiving.notes')}</th>
              {canEdit ? <th className="px-4 py-3">{t('common.actions')}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {task.lineItems.map((item) => {
              const row = rows[item.id];
              const actual = Number(row?.actualQuantity ?? item.expectedQuantity);
              const damaged = Number(row?.damagedQuantity ?? 0);
              const diff = actual - item.expectedQuantity;
              const diffUi = differenceDisplay(diff);
              const rowStatus = row?.rowStatus ?? 'IN_PROGRESS';
              const bg = row ? rowBackgroundClass(rowStatus, row.saveState, row.isDirty) : '';
              return (
                <tr key={item.id} className={bg}>
                  <td className="px-4 py-3">{item.sku}</td>
                  <td className="px-4 py-3 font-medium">{item.productName}</td>
                  <td className="px-4 py-3">{item.expectedQuantity}</td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.actualQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'actualQuantity', e.target.value)}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                      />
                    ) : (
                      actual
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.damagedQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'damagedQuantity', e.target.value)}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                      />
                    ) : (
                      damaged
                    )}
                    {damaged > 0 ? (
                      <span className="ml-2 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                        {t('chinaReceiving.damagedBadge').replace('{qty}', String(damaged))}
                      </span>
                    ) : null}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${diffUi.color}`}>
                    {diffUi.icon ? <span className="mr-1">{diffUi.icon}</span> : null}
                    {diffUi.text}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{statusLabel(t, rowStatus)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{saveStateLabel(t, row?.saveState ?? 'unsaved')}</p>
                    {row?.lastSavedAt ? (
                      <p className="text-xs text-slate-500">
                        {t('chinaReceiving.lastSaved')}: {formatSaveTime(row.lastSavedAt)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <input
                        value={row?.note ?? ''}
                        onChange={(e) => updateRow(item.id, 'note', e.target.value)}
                        className="w-full min-w-[120px] rounded-lg border border-slate-300 px-2 py-1"
                        placeholder={t('chinaReceiving.notes')}
                      />
                    ) : (
                      row?.note ?? '-'
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={row?.saveState === 'saving'}
                        onClick={() => void saveRow(item.id)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('chinaReceiving.saveRow')}
                      </button>
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
            disabled={loading || !allSaved}
            onClick={() => void receiveToHq()}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('chinaReceiving.receiveToHq')}
          </button>
        </div>
      ) : null}

      {(task.shipmentBatches?.length ?? 0) > 0 ? (
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-slate-950">{t('chinaReceiving.shipmentBatch')}</h3>
          {task.shipmentBatches?.map((batch) => (
            <div key={batch.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">{t('chinaReceiving.batchNumber')}</p>
                  <p className="text-lg font-bold text-slate-950">{batch.receivingNumber}</p>
                </div>
                <p className="text-sm text-slate-500">{new Date(batch.receivedAt).toLocaleString()}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">{t('chinaReceiving.col.product')}</th>
                      <th className="px-4 py-3">{t('chinaReceiving.expectedQty')}</th>
                      <th className="px-4 py-3">{t('chinaReceiving.actualQty')}</th>
                      <th className="px-4 py-3">{t('chinaReceiving.difference')}</th>
                      <th className="px-4 py-3">{t('chinaReceiving.actStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batch.items.map((item) => {
                      const act = batch.discrepancyActs.find((row) => row.sku === item.sku);
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-3">{item.sku}</td>
                          <td className="px-4 py-3">{item.productName}</td>
                          <td className="px-4 py-3">{item.expectedQuantity}</td>
                          <td className="px-4 py-3">{item.actualQuantity}</td>
                          <td className="px-4 py-3">{item.difference}</td>
                          <td className="px-4 py-3">{act ? translateStatus(t, act.status) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
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
  tone?: 'red' | 'green' | 'orange' | 'amber';
}) {
  const toneClass =
    tone === 'red'
      ? 'text-red-700'
      : tone === 'green'
        ? 'text-emerald-700'
        : tone === 'orange'
          ? 'text-orange-700'
          : tone === 'amber'
            ? 'text-amber-700'
            : 'text-slate-950';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}
