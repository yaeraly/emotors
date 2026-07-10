'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  buildProgressFromRows,
  clearLocalDraft,
  loadLocalDraft,
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
  autoSave?: boolean;
  networkRecovery?: boolean;
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
};

const AUTO_SAVE_MS = 1000;
const HEARTBEAT_MS = 30_000;
const MAX_RETRIES = 5;

async function saveDraftRow(orderId: string, itemId: string, payload: SaveRowPayload) {
  return apiFetch<{
    actualQuantity: number;
    damagedQuantity: number;
    note: string | null;
    isSaved: boolean;
    lastSavedAt: string;
    rowStatus: string;
  }>(`/procurement/china-receiving/${orderId}/draft-rows/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

function initRowsFromItems(lineItems: ChinaReceivingLineItem[]): Record<string, LocalRowState> {
  const rows: Record<string, LocalRowState> = {};
  for (const item of lineItems) {
    const actual = item.actualReceivedQuantity ?? item.expectedQuantity;
    const damaged = item.damagedQuantity ?? 0;
    const isSaved = item.isSaved ?? false;
    rows[item.id] = {
      actualQuantity: String(actual),
      damagedQuantity: String(damaged),
      note: item.note ?? '',
      saveState: isSaved ? 'saved' : 'unsaved',
      lastSavedAt: item.lastSavedAt ?? null,
      isDirty: false,
      serverIsSaved: isSaved,
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
}: UseChinaReceivingDraftOptions) {
  const [rows, setRows] = useState<Record<string, LocalRowState>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [networkOffline, setNetworkOffline] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingQueue = useRef<PendingSave[]>([]);
  const processingQueue = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!lineItems.length) return;
    const initial = initRowsFromItems(lineItems);
    const localBackup = loadLocalDraft(orderId);
    if (localBackup) {
      for (const [itemId, backup] of Object.entries(localBackup)) {
        if (!initial[itemId]) continue;
        initial[itemId] = {
          ...initial[itemId],
          actualQuantity: backup.actualQuantity,
          damagedQuantity: backup.damagedQuantity,
          note: backup.note,
          isDirty: true,
          saveState: 'unsaved',
          serverIsSaved: false,
        };
      }
    }
    setRows(initial);
  }, [orderId, lineItems]);

  useEffect(() => {
    if (!enabled || readOnly) return;
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
        setRows((current) => {
          const item = lineItems.find((row) => row.id === next.itemId);
          if (!item || !current[next.itemId]) return current;
          return {
            ...current,
            [next.itemId]: {
              ...current[next.itemId],
              saveState: 'saved',
              isDirty: false,
              serverIsSaved: true,
              lastSavedAt: saved.lastSavedAt,
              rowStatus: resolveRowStatus(
                saved.actualQuantity,
                item.expectedQuantity,
                saved.damagedQuantity,
                true,
              ),
            },
          };
        });
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
  }, [lineItems, networkOffline, onNetworkRecovery, onSessionExpired, orderId, readOnly]);

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
    async (itemId: string, autoSave = false) => {
      if (readOnly) return;
      const row = rowsRef.current[itemId];
      const item = lineItems.find((line) => line.id === itemId);
      if (!row || !item) return;

      const payload: SaveRowPayload = {
        actualQuantity: Number(row.actualQuantity) || 0,
        damagedQuantity: Number(row.damagedQuantity) || 0,
        note: row.note || undefined,
        autoSave,
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
        return;
      }

      try {
        const saved = await saveDraftRow(orderId, itemId, payload);
        setRows((current) => ({
          ...current,
          [itemId]: {
            ...current[itemId],
            saveState: 'saved',
            isDirty: false,
            serverIsSaved: true,
            lastSavedAt: saved.lastSavedAt,
            rowStatus: resolveRowStatus(
              saved.actualQuantity,
              item.expectedQuantity,
              saved.damagedQuantity,
              true,
            ),
          },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Save failed';
        if (message === 'Unauthorized') {
          onSessionExpired?.();
          setRows((current) => ({
            ...current,
            [itemId]: { ...current[itemId], saveState: 'unsaved', isDirty: true },
          }));
          return;
        }
        setNetworkOffline(true);
        enqueueSave(itemId, payload);
        setRows((current) => ({
          ...current,
          [itemId]: { ...current[itemId], saveState: 'unsaved', isDirty: true },
        }));
      }
    },
    [enqueueSave, lineItems, onSessionExpired, orderId, readOnly],
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
    (itemId: string, field: 'actualQuantity' | 'damagedQuantity' | 'note', value: string) => {
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
          })),
        }),
      });
      setRows((current) => {
        const next = { ...current };
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
            lastSavedAt: new Date().toISOString(),
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
  }, [orderId]);

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
  };
}
