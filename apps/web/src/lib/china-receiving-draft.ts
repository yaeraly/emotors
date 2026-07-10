export type ChinaReceivingRowStatus =
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SHORTAGE'
  | 'OVERAGE'
  | 'DAMAGED';

export type RowSaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export type LocalRowState = {
  actualQuantity: string;
  damagedQuantity: string;
  unitWeightKg: string;
  note: string;
  saveState: RowSaveState;
  lastSavedAt: string | null;
  updatedAt: string | null;
  isDirty: boolean;
  serverIsSaved: boolean;
  rowStatus: ChinaReceivingRowStatus;
  needsWeightEntry: boolean;
  weightStatus?: 'NOT_SET' | 'PRELIMINARY' | 'CONFIRMED';
};

export type ChinaReceivingProgress = {
  products: number;
  checked: number;
  remaining: number;
  saved: number;
  unsaved: number;
  progress: number;
  expectedQty: number;
  receivedQty: number;
  shortage: number;
  overage: number;
  damaged: number;
};

export type ChinaReceivingLineItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  expectedQuantity: number;
  actualReceivedQuantity?: number | null;
  damagedQuantity?: number;
  unitWeightKg?: number | null;
  weightStatus?: 'NOT_SET' | 'PRELIMINARY' | 'CONFIRMED';
  needsWeightEntry?: boolean;
  note?: string | null;
  isSaved?: boolean;
  isChecked?: boolean;
  lastSavedAt?: string | null;
  updatedAt?: string | null;
  rowStatus?: ChinaReceivingRowStatus;
  difference?: number;
};

export function buildServerDraftFingerprint(lineItems: ChinaReceivingLineItem[]) {
  return lineItems
    .map(
      (item) =>
        `${item.id}:${item.isSaved ? 1 : 0}:${item.actualReceivedQuantity ?? ''}:${item.damagedQuantity ?? ''}:${item.unitWeightKg ?? ''}:${item.note ?? ''}:${item.updatedAt ?? ''}`,
    )
    .join('|');
}

export function computeDifference(actual: number, expected: number) {
  return actual - expected;
}

export function formatSaveTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function resolveRowStatus(
  actual: number,
  expected: number,
  damaged: number,
  isSaved: boolean,
): ChinaReceivingRowStatus {
  if (!isSaved) return 'IN_PROGRESS';
  if (damaged > 0) return 'DAMAGED';
  const diff = computeDifference(actual, expected);
  if (diff < 0) return 'SHORTAGE';
  if (diff > 0) return 'OVERAGE';
  return 'ACCEPTED';
}

export function rowBackgroundClass(
  rowStatus: ChinaReceivingRowStatus,
  saveState: RowSaveState,
  isDirty: boolean,
): string {
  if (isDirty || saveState === 'unsaved') return 'bg-amber-50';
  if (saveState === 'saving') return 'bg-amber-50/70';
  switch (rowStatus) {
    case 'ACCEPTED':
    case 'OVERAGE':
      return 'bg-emerald-50';
    case 'SHORTAGE':
      return 'bg-red-50';
    case 'DAMAGED':
      return 'bg-emerald-50 border-l-4 border-l-orange-400';
    case 'IN_PROGRESS':
    default:
      return 'bg-amber-50';
  }
}

export function differenceDisplay(diff: number) {
  if (diff < 0) {
    return { text: String(diff), color: 'text-red-600', icon: '↓' as const };
  }
  if (diff > 0) {
    return { text: `+${diff}`, color: 'text-emerald-600', icon: '↑' as const };
  }
  return { text: '0', color: 'text-slate-500', icon: null };
}

export function localStorageDraftKey(orderId: string) {
  return `emotors_china_receiving_draft_${orderId}`;
}

export function persistLocalDraft(orderId: string, rows: Record<string, LocalRowState>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    localStorageDraftKey(orderId),
    JSON.stringify({
      savedAt: new Date().toISOString(),
      rows: Object.fromEntries(
        Object.entries(rows).map(([id, row]) => [
          id,
          {
            actualQuantity: row.actualQuantity,
            damagedQuantity: row.damagedQuantity,
            unitWeightKg: row.unitWeightKg,
            note: row.note,
          },
        ]),
      ),
    }),
  );
}

export function loadLocalDraft(orderId: string): Record<string, { actualQuantity: string; damagedQuantity: string; unitWeightKg?: string; note: string }> | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(localStorageDraftKey(orderId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { rows?: Record<string, { actualQuantity: string; damagedQuantity: string; unitWeightKg?: string; note: string }> };
    return parsed.rows ?? null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(orderId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(localStorageDraftKey(orderId));
}

export function buildProgressFromRows(
  lineItems: ChinaReceivingLineItem[],
  rows: Record<string, LocalRowState>,
): ChinaReceivingProgress {
  let saved = 0;
  let unsaved = 0;
  let checked = 0;
  let expectedQty = 0;
  let receivedQty = 0;
  let shortage = 0;
  let overage = 0;
  let damaged = 0;

  for (const item of lineItems) {
    expectedQty += item.expectedQuantity;
    const row = rows[item.id];
    if (!row) continue;
    const actual = Number(row.actualQuantity) || 0;
    const dmg = Number(row.damagedQuantity) || 0;
    if (row.serverIsSaved && !row.isDirty) {
      saved += 1;
      checked += 1;
      receivedQty += actual;
      const diff = computeDifference(actual, item.expectedQuantity);
      if (diff < 0) shortage += Math.abs(diff);
      if (diff > 0) overage += diff;
      if (dmg > 0) damaged += dmg;
    } else if (row.isDirty || row.saveState === 'unsaved' || row.saveState === 'error') {
      unsaved += 1;
    }
  }

  const products = lineItems.length;
  const remaining = products - checked;
  const progress = products > 0 ? Math.round((checked / products) * 100) : 0;

  return { products, checked, remaining, saved, unsaved, progress, expectedQty, receivedQty, shortage, overage, damaged };
}
