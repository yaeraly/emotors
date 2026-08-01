'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  buildProgressFromRows,
  buildServerDraftFingerprint,
  LocalRowState,
  resolveRowStatus,
  type BranchReceivingLineItem,
  type BranchReceivingProgress,
} from '@/lib/branch-receiving-draft';
import { deriveMissingQuantity } from '@/lib/branch-receiving-ui';

type SaveRowPayload = {
  acceptedQuantity: number;
  damagedQuantity: number;
  missingQuantity?: number;
  note?: string;
  expectedUpdatedAt?: string;
};

type SavedDraftResponse = {
  acceptedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  note: string | null;
  isSaved: boolean;
  lastSavedAt: string | null;
  updatedAt: string;
  rowStatus: string;
  receivingProgress: BranchReceivingProgress;
};

type UseBranchReceivingDraftOptions = {
  orderId: string;
  lineItems: BranchReceivingLineItem[];
  readOnly: boolean;
  enabled: boolean;
  onProgressUpdated?: (progress: BranchReceivingProgress) => void;
};

function initRowsFromItems(lineItems: BranchReceivingLineItem[]): Record<string, LocalRowState> {
  const rows: Record<string, LocalRowState> = {};
  for (const item of lineItems) {
    const isSaved = Boolean(item.isSaved);
    const accepted = isSaved
      ? Number(item.acceptedQuantity ?? 0)
      : Number(item.acceptedQuantity ?? item.expectedQuantity);
    const damaged = Number(item.damagedQuantity ?? 0);
    const missing = isSaved
      ? Number(item.missingQuantity ?? 0)
      : Math.max(item.expectedQuantity - accepted - damaged, 0);
    rows[item.id] = {
      acceptedQuantity: String(accepted),
      damagedQuantity: String(damaged),
      missingQuantity: String(missing),
      note: item.note ?? '',
      saveState: isSaved ? 'saved' : 'unsaved',
      lastSavedAt: item.lastSavedAt ?? null,
      updatedAt: item.updatedAt ?? null,
      isDirty: false,
      serverIsSaved: isSaved,
      rowStatus:
        item.rowStatus ?? resolveRowStatus(accepted, item.expectedQuantity, damaged, isSaved),
    };
  }
  return rows;
}

export function useBranchReceivingDraft({
  orderId,
  lineItems,
  readOnly,
  enabled,
  onProgressUpdated,
}: UseBranchReceivingDraftOptions) {
  const [rows, setRows] = useState<Record<string, LocalRowState>>({});
  const [serverProgress, setServerProgress] = useState<BranchReceivingProgress | null>(null);
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

  const localProgress: BranchReceivingProgress = useMemo(
    () => buildProgressFromRows(lineItems, rows),
    [lineItems, rows],
  );

  const progress = serverProgress ?? localProgress;

  const unsavedCount = useMemo(
    () =>
      Object.values(rows).filter(
        (row) => row.isDirty || row.saveState === 'unsaved' || row.saveState === 'error',
      ).length,
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
      setServerProgress(saved.receivingProgress);
      onProgressUpdated?.(saved.receivingProgress);
      setRows((current) => ({
        ...current,
        [itemId]: {
          acceptedQuantity: String(saved.acceptedQuantity),
          damagedQuantity: String(saved.damagedQuantity),
          missingQuantity: String(saved.missingQuantity),
          note: saved.note ?? '',
          saveState: 'saved',
          isDirty: false,
          serverIsSaved: true,
          lastSavedAt: saved.lastSavedAt,
          updatedAt: saved.updatedAt,
          rowStatus: resolveRowStatus(
            saved.acceptedQuantity,
            item.expectedQuantity,
            saved.damagedQuantity,
            true,
          ),
        },
      }));
    },
    [lineItems, onProgressUpdated],
  );

  const saveRow = useCallback(
    async (itemId: string): Promise<boolean> => {
      if (readOnly) return false;
      const row = rowsRef.current[itemId];
      const item = lineItems.find((line) => line.id === itemId);
      if (!row || !item) return false;

      const payload: SaveRowPayload = {
        acceptedQuantity: Number(row.acceptedQuantity) || 0,
        damagedQuantity: Number(row.damagedQuantity) || 0,
        missingQuantity: Number(row.missingQuantity) || 0,
        note: row.note || undefined,
        expectedUpdatedAt: row.updatedAt ?? undefined,
      };

      setRows((current) => ({
        ...current,
        [itemId]: { ...current[itemId], saveState: 'saving' },
      }));

      try {
        const saved = await apiFetch<SavedDraftResponse>(
          `/distribution/orders/${orderId}/receiving-draft-rows/${itemId}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
        );
        applySavedRow(itemId, saved);
        return true;
      } catch {
        setRows((current) => ({
          ...current,
          [itemId]: { ...current[itemId], saveState: 'error', isDirty: true },
        }));
        return false;
      }
    },
    [applySavedRow, lineItems, orderId, readOnly],
  );

  const updateRow = useCallback(
    (
      itemId: string,
      field: 'acceptedQuantity' | 'damagedQuantity' | 'missingQuantity' | 'note',
      value: string,
    ) => {
      if (readOnly) return;
      const item = lineItems.find((line) => line.id === itemId);
      if (!item) return;
      setRows((current) => {
        const prev = current[itemId];
        if (!prev) return current;
        const next = { ...prev, [field]: value, isDirty: true, saveState: 'unsaved' as const };
        const accepted = Number(field === 'acceptedQuantity' ? value : next.acceptedQuantity) || 0;
        const damaged = Number(field === 'damagedQuantity' ? value : next.damagedQuantity) || 0;
        if (field === 'acceptedQuantity' || field === 'damagedQuantity') {
          next.missingQuantity = String(
            deriveMissingQuantity(item.expectedQuantity, accepted, damaged),
          );
        }
        next.rowStatus = resolveRowStatus(accepted, item.expectedQuantity, damaged, false);
        return { ...current, [itemId]: next };
      });
    },
    [lineItems, readOnly],
  );

  return {
    rows,
    progress,
    unsavedCount,
    allSaved,
    saveRow,
    updateRow,
    enabled,
  };
}
