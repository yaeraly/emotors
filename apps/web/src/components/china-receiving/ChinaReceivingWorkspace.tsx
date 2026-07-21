'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { PopupFilterButton } from '@/components/PopupFilterButton';
import { apiFetch, API_URL, getToken } from '@/lib/api';
import { canCreateProcurementOrder, canReceiveProcurementToHq, hasFullAccess } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';
import { useChinaReceivingDraft } from '@/hooks/useChinaReceivingDraft';
import {
  rowBackgroundClass,
  type ChinaReceivingLineItem,
  type ChinaReceivingProgress,
} from '@/lib/china-receiving-draft';
import {
  ALL_CATEGORIES,
  buildCategoryOptions,
  loadStoredFilters,
  matchesFilters,
  persistFilters,
  type ChinaReceivingFilters,
  type VerificationFilterStatus,
} from '@/lib/china-receiving-filters';
import { CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE } from '@/lib/hq-receiving-validation';

type EditSession = {
  lockedByUserId: string;
  lockedByUser: { id: string; fullName: string };
  isCurrentUser: boolean;
  canTakeOver: boolean;
};

type CargoAttachment = { id: string; fileName: string; fileUrl: string; mimeType: string };

type ReceivingSummary = {
  totalProducts: number;
  totalExpected: number;
  totalReceived: number;
  shortage: number;
  overage: number;
  damaged: number;
  discrepancyCounts: {
    shortage: number;
    overage: number;
    damaged: number;
  };
  receivedAt?: string | null;
  receivedBy?: { id: string; fullName: string } | null;
  status: string;
};

type ReceivingDocuments = {
  photos: CargoAttachment[];
  discrepancyActs: Array<{
    id: string;
    actNumber: string;
    differenceType: string;
    status: string;
  }>;
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
  landedCostStatus?: string;
  landedCostPendingWeight?: boolean;
  hqStockMovementCreatedAt?: string | null;
  receivedToHqAt?: string | null;
  lineItems: ChinaReceivingLineItem[];
  progress?: ChinaReceivingProgress;
  receivingSummary?: ReceivingSummary | null;
  documents?: ReceivingDocuments | null;
  cargoAttachments?: CargoAttachment[];
  cargoAttachmentCount?: number;
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

function formatReceivedDateTime(value?: string | null) {
  if (!value) return { date: '-', time: '-' };
  const parsed = new Date(value);
  return {
    date: parsed.toLocaleDateString('ru-RU'),
    time: parsed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function ChinaReceivingWorkspace({
  task,
  user,
  onReload,
}: {
  task: ChinaReceivingDetail;
  user: User;
  onReload: () => Promise<ChinaReceivingDetail | null>;
}) {
  const isCompleted = Boolean(task.hqStockMovementCreatedAt);

  if (isCompleted) {
    return <ChinaReceivingCompletedView task={task} />;
  }

  return <ChinaReceivingEditableView task={task} user={user} onReload={onReload} />;
}

function ChinaReceivingCompletedView({ task }: { task: ChinaReceivingDetail }) {
  const { t } = useTranslation();
  const summary = task.receivingSummary;
  const receivedAtSource = summary?.receivedAt ?? task.receivedToHqAt ?? task.hqStockMovementCreatedAt;
  const receivedAt = formatReceivedDateTime(receivedAtSource);
  const hasDiscrepancyActs =
    (summary?.discrepancyCounts.shortage ?? 0) > 0 ||
    (summary?.discrepancyCounts.overage ?? 0) > 0 ||
    (summary?.discrepancyCounts.damaged ?? 0) > 0;
  const hasDocuments =
    (task.documents?.photos.length ?? 0) > 0 ||
    (task.documents?.discrepancyActs.length ?? 0) > 0 ||
    (task.shipmentBatches?.length ?? 0) > 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('chinaReceiving.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{task.orderNumber}</h2>
          <p className="text-sm text-slate-500">
            {task.hqWarehouse?.name} · {translateStatus(t, task.receivingStatus, 'procurement')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hq-warehouses/china-receiving" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
            {t('common.back')}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            {t('chinaReceiving.print')}
          </button>
        </div>
      </div>

      <div id="china-receiving-print" className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Info label={t('chinaReceiving.orderNumber')} value={task.orderNumber} />
          <Info label={t('common.status')} value={translateStatus(t, task.receivingStatus, 'procurement')} />
          <Info label={t('chinaReceiving.targetWarehouse')} value={task.hqWarehouse?.name ?? '-'} />
          <Info
            label={t('chinaReceiving.supplyManager')}
            value={task.supplyManager?.fullName ?? t('chinaReceiving.supplyManagerNotAssigned')}
          />
          <Info label={t('chinaReceiving.purchaseDate')} value={formatOrderDate(task.purchaseDate)} />
          <Info label={t('chinaReceiving.viewSummary.receivedAt')} value={receivedAt.date} />
        </div>

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
                        <th className="px-4 py-3">{t('chinaReceiving.col.product')}</th>
                        <th className="px-4 py-3">{t('chinaReceiving.col.expectedShort')}</th>
                        <th className="px-4 py-3">{t('chinaReceiving.col.actualShort')}</th>
                        <th className="px-4 py-3">{t('chinaReceiving.col.diffShort')}</th>
                        <th className="px-4 py-3">{t('chinaReceiving.actStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batch.items.map((item) => {
                        const act = batch.discrepancyActs.find((row) => row.sku === item.sku);
                        return (
                          <tr key={item.id}>
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

        {summary ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('chinaReceiving.viewSummary.title')}</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryRow label={t('chinaReceiving.summary.products')} value={String(summary.totalProducts)} />
              <SummaryRow label={t('chinaReceiving.summary.expectedQty')} value={String(summary.totalExpected)} />
              <SummaryRow label={t('chinaReceiving.summary.receivedQty')} value={String(summary.totalReceived)} />
              <SummaryRow label={t('chinaReceiving.summary.shortage')} value={String(summary.shortage)} tone="red" />
              <SummaryRow label={t('chinaReceiving.summary.overage')} value={String(summary.overage)} tone="green" />
              <SummaryRow label={t('chinaReceiving.summary.damaged')} value={String(summary.damaged)} tone="orange" />
              <SummaryRow label={t('chinaReceiving.viewSummary.receivedAt')} value={receivedAt.date} />
              <SummaryRow label={t('chinaReceiving.viewSummary.receivedTime')} value={receivedAt.time} />
              <SummaryRow
                label={t('chinaReceiving.viewSummary.receivedBy')}
                value={summary.receivedBy?.fullName ?? '-'}
              />
              <SummaryRow
                label={t('chinaReceiving.viewSummary.status')}
                value={translateStatus(t, summary.status, 'procurement')}
              />
            </dl>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">{t('chinaReceiving.discrepancies.title')}</h3>
          {hasDiscrepancyActs ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <SummaryRow
                label={t('chinaReceiving.summary.shortage')}
                value={String(summary?.discrepancyCounts.shortage ?? 0)}
                tone="red"
              />
              <SummaryRow
                label={t('chinaReceiving.summary.overage')}
                value={String(summary?.discrepancyCounts.overage ?? 0)}
                tone="green"
              />
              <SummaryRow
                label={t('chinaReceiving.summary.damaged')}
                value={String(summary?.discrepancyCounts.damaged ?? 0)}
                tone="orange"
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-600">{t('chinaReceiving.discrepancies.none')}</p>
          )}
        </div>

        {hasDocuments ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('chinaReceiving.documents.title')}</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {(task.documents?.discrepancyActs.length ?? 0) > 0 ? (
                <li>
                  <p className="font-semibold text-slate-900">{t('chinaReceiving.documents.discrepancyAct')}</p>
                  <ul className="mt-1 space-y-1 pl-4">
                    {task.documents?.discrepancyActs.map((act) => (
                      <li key={act.id}>
                        {act.actNumber} · {translateStatus(t, act.differenceType, 'procurement')}
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {(task.documents?.photos.length ?? 0) > 0 ? (
                <li>
                  <p className="font-semibold text-slate-900">{t('chinaReceiving.documents.photos')}</p>
                  <ul className="mt-1 space-y-1 pl-4">
                    {task.documents?.photos.map((photo) => (
                      <li key={photo.id}>
                        <a
                          href={`${API_URL}${photo.fileUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {photo.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {(task.shipmentBatches?.length ?? 0) > 0 ? (
                <li>
                  <p className="font-semibold text-slate-900">{t('chinaReceiving.documents.receivingDocs')}</p>
                  <ul className="mt-1 space-y-1 pl-4">
                    {task.shipmentBatches?.map((batch) => (
                      <li key={batch.id}>
                        {batch.receivingNumber} · {new Date(batch.receivedAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ChinaReceivingEditableView({
  task,
  user,
  onReload,
}: {
  task: ChinaReceivingDetail;
  user: User;
  onReload: () => Promise<ChinaReceivingDetail | null>;
}) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState('');
  const [cargoReceiptError, setCargoReceiptError] = useState('');
  const [highlightCargoAttachment, setHighlightCargoAttachment] = useState(false);
  const [uploadingCargoReceipt, setUploadingCargoReceipt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [filters, setFilters] = useState<ChinaReceivingFilters>(() => ({
    categoryId: ALL_CATEGORIES,
    search: '',
    status: 'all',
  }));
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    const stored = loadStoredFilters(task.id);
    if (stored) setFilters(stored);
    setFiltersReady(true);
  }, [task.id]);

  useEffect(() => {
    if (!filtersReady) return;
    persistFilters(task.id, filters);
  }, [filters, filtersReady, task.id]);

  const updateFilters = useCallback((patch: Partial<ChinaReceivingFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const readOnly = Boolean(task.readOnly) || !canReceiveProcurementToHq(user);
  const canEdit = canReceiveProcurementToHq(user) && !readOnly;
  const isCeo = hasFullAccess(user);
  const canUploadCargoReceipt = canCreateProcurementOrder(user) || canReceiveProcurementToHq(user);
  const cargoAttachments = task.cargoAttachments ?? task.documents?.photos ?? [];
  const hasCargoReceiptAttachment = cargoAttachments.length > 0 || (task.cargoAttachmentCount ?? 0) > 0;

  useEffect(() => {
    if (hasCargoReceiptAttachment) {
      setCargoReceiptError('');
      setHighlightCargoAttachment(false);
    }
  }, [hasCargoReceiptAttachment]);

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
    reloadFromServer,
  } = useChinaReceivingDraft({
    orderId: task.id,
    lineItems: task.lineItems,
    readOnly: !canEdit,
    enabled: true,
    onSessionExpired: () => {
      setSessionExpired(true);
      setShowLoginPrompt(true);
    },
    onNetworkRecovery: () => setError(''),
    onDraftConflict: () => {
      setError(t('chinaReceiving.draftConflict'));
      void onReload().then((detail) => {
        if (detail?.lineItems?.length) reloadFromServer(detail.lineItems);
      });
    },
  });

  const displayProgress = progress.products > 0 ? progress : task.progress ?? progress;

  const uncategorizedLabel = t('chinaReceiving.category.uncategorized');
  const categoryOptions = useMemo(
    () => buildCategoryOptions(task.lineItems, language, t('chinaReceiving.category.all'), uncategorizedLabel),
    [task.lineItems, language, t, uncategorizedLabel],
  );

  const filteredLineItems = useMemo(
    () => task.lineItems.filter((item) => matchesFilters(item, rows[item.id], filters)),
    [task.lineItems, rows, filters],
  );

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('chinaReceiving.verificationStatus.allStatuses') },
      { value: 'unchecked', label: t('chinaReceiving.verificationStatus.unchecked') },
      { value: 'checked', label: t('chinaReceiving.verificationStatus.checked') },
      { value: 'discrepancy', label: t('chinaReceiving.verificationStatus.discrepancy') },
    ],
    [t],
  );

  const hasActiveFilters =
    filters.categoryId !== ALL_CATEGORIES || filters.search.trim().length > 0 || filters.status !== 'all';

  const showSaveToast = useCallback(() => {
    setSaveToast(t('chinaReceiving.savedToast'));
    window.setTimeout(() => setSaveToast(null), 2000);
  }, [t]);

  const handleSaveRow = useCallback(
    async (itemId: string) => {
      const saved = await saveRow(itemId);
      if (saved) showSaveToast();
    },
    [showSaveToast, saveRow],
  );

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

  function resolveReceiveErrorMessage(message: string) {
    if (
      message === CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE
      || message.toLowerCase().includes('cargo receipt')
      || message.toLowerCase().includes('квитанц')
    ) {
      return t('chinaReceiving.cargoReceiptRequired');
    }
    return message;
  }

  async function uploadCargoReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canUploadCargoReceipt) return;
    const token = getToken();
    if (!token) return;
    setUploadingCargoReceipt(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_URL}/procurement/orders/${task.id}/attachments/cargo-receipt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || t('common.error'));
      }
      setCargoReceiptError('');
      setHighlightCargoAttachment(false);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setUploadingCargoReceipt(false);
    }
  }

  async function receiveToHq() {
    if (!canEdit || !allSaved) return;
    if (!hasCargoReceiptAttachment) {
      setCargoReceiptError(t('chinaReceiving.cargoReceiptRequired'));
      setHighlightCargoAttachment(true);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    setCargoReceiptError('');
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
      const message = err instanceof Error ? err.message : t('common.error');
      const friendly = resolveReceiveErrorMessage(message);
      if (friendly === t('chinaReceiving.cargoReceiptRequired')) {
        setCargoReceiptError(friendly);
        setHighlightCargoAttachment(true);
        setError('');
      } else {
        setError(friendly);
      }
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

      {saveToast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {saveToast}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label={t('chinaReceiving.summary.products')} value={String(displayProgress.products)} />
        <SummaryCard label={t('chinaReceiving.summary.expectedQty')} value={String(displayProgress.expectedQty)} />
        <SummaryCard label={t('chinaReceiving.summary.receivedQty')} value={String(displayProgress.receivedQty)} />
        <SummaryCard label={t('chinaReceiving.summary.shortage')} value={String(displayProgress.shortage)} tone="red" />
        <SummaryCard label={t('chinaReceiving.summary.overage')} value={String(displayProgress.overage)} tone="green" />
        <SummaryCard label={t('chinaReceiving.summary.damaged')} value={String(displayProgress.damaged)} tone="orange" />
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
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${displayProgress.progress}%` }}
          />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <PopupFilterButton
            label={t('chinaReceiving.filterCategory')}
            value={filters.categoryId}
            options={categoryOptions}
            allValue={ALL_CATEGORIES}
            allLabel={t('chinaReceiving.category.all')}
            onChange={(value) => updateFilters({ categoryId: value })}
            formatActiveLabel={(label, selectedLabel) => `${label}: ${selectedLabel}`}
          />
          <PopupFilterButton
            label={t('chinaReceiving.verificationStatus.label')}
            value={filters.status}
            options={statusFilterOptions}
            allValue="all"
            allLabel={t('chinaReceiving.verificationStatus.allStatuses')}
            onChange={(value) => updateFilters({ status: value as VerificationFilterStatus })}
            formatActiveLabel={(label, selectedLabel) => `${label}: ${selectedLabel}`}
          />
          <label className="block min-w-[12rem] flex-1">
            <span className="text-sm font-semibold text-slate-700">{t('chinaReceiving.searchProduct')}</span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
              placeholder={t('chinaReceiving.searchProductPlaceholder')}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>
              {t('chinaReceiving.filteredCount')
                .replace('{shown}', String(filteredLineItems.length))
                .replace('{total}', String(task.lineItems.length))}
            </span>
            <button
              type="button"
              onClick={() => updateFilters({ categoryId: ALL_CATEGORIES, search: '', status: 'all' })}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
            >
              {t('common.reset')}
            </button>
          </div>
        ) : null}
      </section>

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

      {task.landedCostPendingWeight ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('chinaReceiving.landedCostPendingWeight')}</p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2" title={t('chinaReceiving.col.product')}>{t('chinaReceiving.col.productShort')}</th>
              <th className="w-14 px-2 py-2" title={t('chinaReceiving.expectedQty')}>{t('chinaReceiving.col.expectedShort')}</th>
              <th className="w-16 px-2 py-2" title={t('chinaReceiving.actualQty')}>{t('chinaReceiving.col.actualShort')}</th>
              <th className="w-14 px-2 py-2" title={t('chinaReceiving.damagedQty')}>{t('chinaReceiving.col.damagedShort')}</th>
              <th className="w-16 px-2 py-2" title={t('chinaReceiving.unitWeightKg')}>{t('chinaReceiving.col.weightShort')}</th>
              <th className="w-12 px-2 py-2" title={t('chinaReceiving.summary.shortage')}>{t('chinaReceiving.col.shortageShort')}</th>
              <th className="w-12 px-2 py-2" title={t('chinaReceiving.summary.overage')}>{t('chinaReceiving.col.overageShort')}</th>
              <th className="w-28 px-2 py-2" title={t('chinaReceiving.notes')}>{t('chinaReceiving.col.notesShort')}</th>
              {canEdit ? (
                <th className="w-20 px-2 py-2" title={t('common.actions')}>{t('chinaReceiving.col.actionsShort')}</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLineItems.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className="px-4 py-8 text-center text-sm text-slate-500">
                  {t('chinaReceiving.noFilteredProducts')}
                </td>
              </tr>
            ) : null}
            {filteredLineItems.map((item) => {
              const row = rows[item.id];
              const actual = Number(row?.actualQuantity ?? item.expectedQuantity);
              const damaged = Number(row?.damagedQuantity ?? 0);
              const diff = actual - item.expectedQuantity;
              const shortage = diff < 0 ? Math.abs(diff) : 0;
              const overage = diff > 0 ? diff : 0;
              const rowStatus = row?.rowStatus ?? 'IN_PROGRESS';
              const bg = row ? rowBackgroundClass(rowStatus, row.saveState, row.isDirty) : '';
              const noteValue = row?.note ?? '';
              const needsWeight = row?.needsWeightEntry ?? item.needsWeightEntry;
              const unitWeight = row?.unitWeightKg ?? (item.unitWeightKg != null ? String(item.unitWeightKg) : '');
              return (
                <tr key={item.id} className={bg}>
                  <td className="px-2 py-2">
                    <p className="truncate font-medium text-slate-900" title={item.productName}>
                      {item.productName}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-center">{item.expectedQuantity}</td>
                  <td className="px-2 py-2">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.actualQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'actualQuantity', e.target.value)}
                        className="w-full rounded border border-slate-300 px-1.5 py-1 text-center"
                        title={t('chinaReceiving.actualQty')}
                      />
                    ) : (
                      <span className="block text-center">{actual}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        value={row?.damagedQuantity ?? ''}
                        onChange={(e) => updateRow(item.id, 'damagedQuantity', e.target.value)}
                        className={`w-full rounded border px-1.5 py-1 text-center ${damaged > 0 ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-300'}`}
                        title={t('chinaReceiving.damagedQty')}
                      />
                    ) : (
                      <span className={`block text-center ${damaged > 0 ? 'font-semibold text-orange-700' : ''}`}>{damaged}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canEdit && needsWeight ? (
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={unitWeight}
                        onChange={(e) => updateRow(item.id, 'unitWeightKg', e.target.value)}
                        className="w-full rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-center"
                        title={t('chinaReceiving.unitWeightKg')}
                        placeholder="кг"
                      />
                    ) : (
                      <span className="block text-center">{unitWeight || '-'}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center font-semibold text-red-600">
                    {shortage > 0 ? shortage : '-'}
                  </td>
                  <td className="px-2 py-2 text-center font-semibold text-emerald-600">
                    {overage > 0 ? overage : '-'}
                  </td>
                  <td className="px-2 py-2">
                    {canEdit ? (
                      <input
                        value={noteValue}
                        onChange={(e) => updateRow(item.id, 'note', e.target.value)}
                        className="w-full rounded border border-slate-300 px-1.5 py-1"
                        title={noteValue || t('chinaReceiving.notes')}
                        placeholder={t('chinaReceiving.col.notesShort')}
                      />
                    ) : (
                      <span className="block truncate" title={noteValue || undefined}>{noteValue || '-'}</span>
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        disabled={row?.saveState === 'saving'}
                        onClick={() => void handleSaveRow(item.id)}
                        className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        title={t('chinaReceiving.saveRow')}
                      >
                        {row?.saveState === 'saving' ? t('chinaReceiving.saveState.saving') : t('chinaReceiving.saveRow')}
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
          <section
            className={`w-full rounded-2xl border p-4 shadow-sm ${
              highlightCargoAttachment || cargoReceiptError
                ? 'border-red-400 bg-red-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">{t('chinaReceiving.cargoReceiptSection')}</h3>
                <p className="mt-1 text-xs text-slate-500">{t('chinaReceiving.cargoReceiptHint')}</p>
              </div>
              {canUploadCargoReceipt ? (
                <label className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold ${
                  highlightCargoAttachment || cargoReceiptError
                    ? 'border-red-300 bg-white text-red-700'
                    : 'border-blue-200 text-blue-700'
                }`}>
                  {uploadingCargoReceipt ? t('common.loading') : t('procurement.payments.attachCargoReceipt')}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    disabled={uploadingCargoReceipt}
                    onChange={(e) => void uploadCargoReceipt(e)}
                  />
                </label>
              ) : null}
            </div>
            {cargoAttachments.length ? (
              <ul className="mt-3 space-y-2">
                {cargoAttachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={`${API_URL}${attachment.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-blue-700"
                    >
                      {attachment.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-3 text-sm ${cargoReceiptError ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                {t('procurement.payments.noCargoAttachments')}
              </p>
            )}
            {cargoReceiptError ? (
              <p className="mt-3 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
                {cargoReceiptError}
              </p>
            ) : null}
          </section>
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

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'green' | 'orange';
}) {
  const toneClass =
    tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : tone === 'orange' ? 'text-orange-700' : 'text-slate-950';
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={`text-sm font-bold ${toneClass}`}>{value}</dd>
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
