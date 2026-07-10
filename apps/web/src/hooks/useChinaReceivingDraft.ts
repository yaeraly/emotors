'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  buildProgressFromRows,
  buildServerDraftFingerprint,
  clearLocalDraft,
  LocalRowState,
  persistLocalDraft,
  resolveRowStatus,
  type ChinaReceivingLineItem,
  type ChinaReceivingProgress,
} from '@/lib/china-receiving-draft';

type SaveRowPayload = {
  actualQuantity: number;
  damagedQuantity: number;
  note?: string;
  unitWeightKg?: number;
  autoSave?: boolean;
  networkRecovery?: boolean;
  expectedUpdatedAt?: string;
};

type PendingSave = {
  itemId: string;
  payload: SaveRowPayload;
  retries: number;
};

type UseChinaReceivingDraftOptions = {
  orderId: string;
  lineItems: ChinaReceivingLineItem[];
  readOnly: boolean;
  enabled: boolean;
  onSessionExpired?: () => void;
  onNetworkRecovery?: () => void;
  onDraftConflict?: () => void;
};

const AUTO_SAVE_MS = 1000;
const HEARTBEAT_MS = 30_000;
const MAX_RETRIES = 5;

type SavedDraftResponse = {
  actualQuantity: number;
  damagedQuantity: number;
  note: string | null;
  unitWeightKg?: number | null;
  weightStatus?: string;
  productMasterWeightUpdated?: boolean;
  productMasterWeightMismatch?: boolean;
  isSaved: boolean;
  lastSavedAt: string | null;
  updatedAt: string;
  rowStatus: string;
};

async function saveDraftRow(orderId: string, itemId: string, payload: SaveRowPayload) {
  return apiFetch<SavedDraftResponse>(`/procurement/china-receiving/${orderId}/draft-rows/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

function initRowsFromItems(lineItems: ChinaReceivingLineItem[]): Record<string, LocalRowState> {
  const rows: Record<string, LocalRowState> = {};
  for (const item of lineItems) {
    const isSaved = Boolean(item.isSaved);
    const actual = isSaved
      ? Number(item.actualReceivedQuantity ?? 0)
      : Number(item.actualReceivedQuantity ?? item.expectedQuantity);
    const damaged = Number(item.damagedQuantity ?? 0);
    rows[item.id] = {
      actualQuantity: String(actual),
      damagedQuantity: String(damaged),
      unitWeightKg: item.unitWeightKg != null ? String(item.unitWeightKg) : '',
      note: item.note ?? '',
      saveState: isSaved ? 'saved' : 'unsaved',
      lastSavedAt: item.lastSavedAt ?? null,
      updatedAt: item.updatedAt ?? null,
      isDirty: false,
      serverIsSaved: isSaved,
      needsWeightEntry: Boolean(item.needsWeightEntry ?? item.weightStatus === 'NOT_SET'),
      weightStatus: item.weightStatus,
      rowStatus: item.rowStatus ?? resolveRowStatus(actual, item.expectedQuantity, damaged, isSaved),
    };
  }
  return rows;
}

export function useChinaReceivingDraft({
  orderId,
  lineItems,
  readOnly,
  enabled,
  onSessionExpired,
  onNetworkRecovery,
  onDraftConflict,
}: UseChinaReceivingDraftOptions) {
  const [rows, setRows] = useState<Record<string, LocalRowState>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [networkOffline, setNetworkOffline] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingQueue = useRef<PendingSave[]>([]);
  const processingQueue = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const serverDraftFingerprint = useMemo(() => buildServerDraftFingerprint(lineItems), [lineItems]);
  const initializedFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (!lineItems.length) return;
    if (initializedFingerprint.current === serverDraftFingerprint) return;
    initializedFingerprint.current = serverDraftFingerprint;
    setRows(initRowsFromItems(lineItems));
  }, [orderId, lineItems, serverDraftFingerprint]);

  useEffect(() => {
    if (!enabled || readOnly) return;
    const hasUnsaved = Object.values(rows).some((row) => row.isDirty || !row.serverIsSaved);
    if (!hasUnsaved) return;
    persistLocalDraft(orderId, rows);
  }, [orderId, rows, enabled, readOnly]);

  const progress: ChinaReceivingProgress = useMemo(
    () => buildProgressFromRows(lineItems, rows),
    [lineItems, rows],
  );

  const unsavedCount = useMemo(
    () => Object.values(rows).filter((row) => row.isDirty || row.saveState === 'unsaved' || row.saveState === 'error').length,
    [rows],
  );

  const allSaved = useMemo(
    () =>
      lineItems.length > 0 &&
      lineItems.every((item) => {
        const row = rows[item.id];
        return row && row.serverIsSaved && !row.isDirty;
      }),
    [lineItems, rows],
  );

  const applySavedRow = useCallback(
    (itemId: string, saved: SavedDraftResponse) => {
      const item = lineItems.find((line) => line.id === itemId);
      if (!item) return;
      setRows((current) => ({
        ...current,
        [itemId]: {
          actualQuantity: String(saved.actualQuantity),
          damagedQuantity: String(saved.damagedQuantity),
          unitWeightKg: saved.unitWeightKg != null ? String(saved.unitWeightKg) : current[itemId]?.unitWeightKg ?? '',
          note: saved.note ?? '',
          saveState: 'saved',
          isDirty: false,
          serverIsSaved: true,
          lastSavedAt: saved.lastSavedAt,
          updatedAt: saved.updatedAt,
          needsWeightEntry: saved.weightStatus === 'NOT_SET',
          weightStatus: (saved.weightStatus as LocalRowState['weightStatus']) ?? current[itemId]?.weightStatus,
          rowStatus: resolveRowStatus(
            saved.actualQuantity,
            item.expectedQuantity,
            saved.damagedQuantity,
            true,
          ),
        },
      }));
    },
    [lineItems],
  );

  const processQueue = useCallback(async () => {
    if (processingQueue.current || readOnly) return;
    processingQueue.current = true;
    while (pendingQueue.current.length > 0) {
      const next = pendingQueue.current[0];
      try {
        const saved = await saveDraftRow(orderId, next.itemId, {
          ...next.payload,
          networkRecovery: true,
        });
        pendingQueue.current.shift();
        applySavedRow(next.itemId, saved);
        if (networkOffline) {
          setNetworkOffline(false);
          onNetworkRecovery?.();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Save failed';
        if (message === 'Unauthorized') {
          onSessionExpired?.();
          break;
        }
        if (message === 'CHINA_RECEIVING_DRAFT_CONFLICT') {
          onDraftConflict?.();
          pendingQueue.current.shift();
          break;
        }
        next.retries += 1;
        if (next.retries >= MAX_RETRIES) {
          pendingQueue.current.shift();
          setRows((current) => ({
            ...current,
            [next.itemId]: current[next.itemId]
              ? { ...current[next.itemId], saveState: 'error' }
              : current[next.itemId],
          }));
        } else {
          await new Promise((resolve) => setTimeout(resolve, Math.min(4000, 500 * 2 ** next.retries)));
        }
      }
    }
    processingQueue.current = false;
  }, [applySavedRow, networkOffline, onDraftConflict, onNetworkRecovery, onSessionExpired, orderId, readOnly]);

  const enqueueSave = useCallback(
    (itemId: string, payload: SaveRowPayload) => {
      if (readOnly) return;
      pendingQueue.current = pendingQueue.current.filter((entry) => entry.itemId !== itemId);
      pendingQueue.current.push({ itemId, payload, retries: 0 });
      void processQueue();
    },
    [processQueue, readOnly],
  );

  const saveRow = useCallback(
    async (itemId: string, autoSave = false): Promise<boolean> => {
      if (readOnly) return false;
      const row = rowsRef.current[itemId];
      const item = lineItems.find((line) => line.id === itemId);
      if (!row || !item) return false;

      const payload: SaveRowPayload = {
        actualQuantity: Number(row.actualQuantity) || 0,
        damagedQuantity: Number(row.damagedQuantity) || 0,
        note: row.note || undefined,
        unitWeightKg: row.unitWeightKg ? Number(row.unitWeightKg) : undefined,
        autoSave,
        expectedUpdatedAt: row.updatedAt ?? undefined,
      };

      setRows((current) => ({
        ...current,
        [itemId]: { ...current[itemId], saveState: 'saving' },
      }));

      if (!navigator.onLine) {
        setNetworkOffline(true);
        enqueueSave(itemId, payload);
        setRows((current) => ({
          ...current,
          [itemId]: { ...current[itemId], saveState: 'unsaved', isDirty: true },
        }));
        return false;
      }

      try {
        const saved = await saveDraftRow(orderId, itemId, payload);
        applySavedRow(itemId, saved);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Save failed';
        if (message === 'Unauthorized') {
          onSessionExpired?.();
        } else if (message === 'CHINA_RECEIVING_DRAFT_CONFLICT') {
          onDraftConflict?.();
        } else {
          setNetworkOffline(true);
          enqueueSave(itemId, payload);
        }
        setRows((current) => ({
          ...current,
          [itemId]: { ...current[itemId], saveState: 'unsaved', isDirty: true },
        }));
        return false;
      }
    },
    [applySavedRow, enqueueSave, lineItems, onDraftConflict, onSessionExpired, orderId, readOnly],
  );

  const scheduleAutoSave = useCallback(
    (itemId: string) => {
      if (readOnly) return;
      if (debounceTimers.current[itemId]) {
        clearTimeout(debounceTimers.current[itemId]);
      }
      debounceTimers.current[itemId] = setTimeout(() => {
        void saveRow(itemId, true);
      }, AUTO_SAVE_MS);
    },
    [readOnly, saveRow],
  );

  const updateRow = useCallback(
    (itemId: string, field: 'actualQuantity' | 'damagedQuantity' | 'unitWeightKg' | 'note', value: string) => {
      if (readOnly) return;
      const item = lineItems.find((line) => line.id === itemId);
      if (!item) return;
      setRows((current) => {
        const prev = current[itemId];
        if (!prev) return current;
        const next = { ...prev, [field]: value, isDirty: true, saveState: 'unsaved' as const };
        const actual = Number(field === 'actualQuantity' ? value : next.actualQuantity) || 0;
        const damaged = Number(field === 'damagedQuantity' ? value : next.damagedQuantity) || 0;
        next.rowStatus = resolveRowStatus(actual, item.expectedQuantity, damaged, false);
        return { ...current, [itemId]: next };
      });
      scheduleAutoSave(itemId);
    },
    [lineItems, readOnly, scheduleAutoSave],
  );

  const saveAll = useCallback(async () => {
    if (readOnly) return;
    setSavingAll(true);
    const dirtyRows = Object.entries(rowsRef.current).filter(([, row]) => row.isDirty || !row.serverIsSaved);
    try {
      if (!navigator.onLine) {
        for (const [itemId, row] of dirtyRows) {
          enqueueSave(itemId, {
            actualQuantity: Number(row.actualQuantity) || 0,
            damagedQuantity: Number(row.damagedQuantity) || 0,
            note: row.note || undefined,
            expectedUpdatedAt: row.updatedAt ?? undefined,
          });
        }
        setNetworkOffline(true);
        return;
      }
      await apiFetch(`/procurement/china-receiving/${orderId}/draft-rows/save-all`, {
        method: 'POST',
        body: JSON.stringify({
          rows: dirtyRows.map(([itemId, row]) => ({
            procurementItemId: itemId,
            actualQuantity: Number(row.actualQuantity) || 0,
            damagedQuantity: Number(row.damagedQuantity) || 0,
            note: row.note || undefined,
            unitWeightKg: row.unitWeightKg ? Number(row.unitWeightKg) : undefined,
          })),
        }),
      });
      setRows((current) => {
        const next = { ...current };
        const now = new Date().toISOString();
        for (const [itemId] of dirtyRows) {
          const item = lineItems.find((line) => line.id === itemId);
          if (!item || !next[itemId]) continue;
          const actual = Number(next[itemId].actualQuantity) || 0;
          const damaged = Number(next[itemId].damagedQuantity) || 0;
          next[itemId] = {
            ...next[itemId],
            saveState: 'saved',
            isDirty: false,
            serverIsSaved: true,
            lastSavedAt: now,
            updatedAt: now,
            rowStatus: resolveRowStatus(actual, item.expectedQuantity, damaged, true),
          };
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      if (message === 'Unauthorized') {
        onSessionExpired?.();
      } else {
        for (const [itemId, row] of dirtyRows) {
          enqueueSave(itemId, {
            actualQuantity: Number(row.actualQuantity) || 0,
            damagedQuantity: Number(row.damagedQuantity) || 0,
            note: row.note || undefined,
            expectedUpdatedAt: row.updatedAt ?? undefined,
          });
        }
        setNetworkOffline(true);
      }
    } finally {
      setSavingAll(false);
    }
  }, [enqueueSave, lineItems, onSessionExpired, orderId, readOnly]);

  useEffect(() => {
    if (!enabled || readOnly) return;
    const onOnline = () => {
      void processQueue();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled, processQueue, readOnly]);

  useEffect(() => {
    if (!enabled || readOnly) return;
    const heartbeat = () => {
      void apiFetch(`/procurement/china-receiving/${orderId}/session`, { method: 'POST' }).catch(() => undefined);
    };
    heartbeat();
    const timer = setInterval(heartbeat, HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      void apiFetch(`/procurement/china-receiving/${orderId}/session/release`, { method: 'POST' }).catch(() => undefined);
    };
  }, [enabled, orderId, readOnly]);

  useEffect(() => {
    if (!enabled || unsavedCount === 0) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled, unsavedCount]);

  const clearDraftAfterComplete = useCallback(() => {
    clearLocalDraft(orderId);
    initializedFingerprint.current = null;
  }, [orderId]);

  const reloadFromServer = useCallback((items: ChinaReceivingLineItem[]) => {
    initializedFingerprint.current = buildServerDraftFingerprint(items);
    setRows(initRowsFromItems(items));
  }, []);

  return {
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
  };
}
