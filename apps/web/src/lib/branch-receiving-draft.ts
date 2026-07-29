export type BranchReceivingRowStatus =
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SHORTAGE'
  | 'OVERAGE'
  | 'DAMAGED';

export type RowSaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export type LocalRowState = {
  acceptedQuantity: string;
  damagedQuantity: string;
  missingQuantity: string;
  note: string;
  saveState: RowSaveState;
  lastSavedAt: string | null;
  updatedAt: string | null;
  isDirty: boolean;
  serverIsSaved: boolean;
  rowStatus: BranchReceivingRowStatus;
};

export type BranchReceivingProgress = {
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
  discrepancyLines: number;
};

export type BranchReceivingLineItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  expectedQuantity: number;
  acceptedQuantity?: number | null;
  damagedQuantity?: number;
  missingQuantity?: number | null;
  note?: string | null;
  isSaved?: boolean;
  lastSavedAt?: string | null;
  updatedAt?: string | null;
  rowStatus?: BranchReceivingRowStatus;
  difference?: number;
};

export function computeDifference(actual: number, expected: number) {
  return actual - expected;
}

export function resolveRowStatus(
  accepted: number,
  expected: number,
  damaged: number,
  isSaved: boolean,
): BranchReceivingRowStatus {
  if (!isSaved) return 'IN_PROGRESS';
  if (damaged > 0) return 'DAMAGED';
  const diff = computeDifference(accepted, expected);
  if (diff < 0) return 'SHORTAGE';
  if (diff > 0) return 'OVERAGE';
  return 'ACCEPTED';
}

export function rowBackgroundClass(
  rowStatus: BranchReceivingRowStatus,
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

export function buildServerDraftFingerprint(lineItems: BranchReceivingLineItem[]) {
  return lineItems
    .map(
      (item) =>
        `${item.id}:${item.isSaved ? 1 : 0}:${item.acceptedQuantity ?? ''}:${item.damagedQuantity ?? ''}:${item.missingQuantity ?? ''}:${item.note ?? ''}:${item.updatedAt ?? ''}`,
    )
    .join('|');
}

export function buildProgressFromRows(
  lineItems: BranchReceivingLineItem[],
  rows: Record<string, LocalRowState>,
): BranchReceivingProgress {
  let saved = 0;
  let unsaved = 0;
  let checked = 0;
  let expectedQty = 0;
  let receivedQty = 0;
  let shortage = 0;
  let overage = 0;
  let damaged = 0;
  let discrepancyLines = 0;

  for (const item of lineItems) {
    expectedQty += item.expectedQuantity;
    const row = rows[item.id];
    if (!row) continue;
    const accepted = Number(row.acceptedQuantity) || 0;
    const dmg = Number(row.damagedQuantity) || 0;
    const missing = Number(row.missingQuantity) || 0;
    if (row.serverIsSaved && !row.isDirty) {
      saved += 1;
      checked += 1;
      receivedQty += accepted;
      const diff = computeDifference(accepted, item.expectedQuantity);
      if (diff < 0) shortage += Math.abs(diff);
      if (diff > 0) overage += diff;
      if (dmg > 0) damaged += dmg;
      if (diff !== 0 || dmg > 0 || missing > 0) discrepancyLines += 1;
    } else if (row.isDirty || row.saveState === 'unsaved' || row.saveState === 'error') {
      unsaved += 1;
    }
  }

  const products = lineItems.length;
  const remaining = products - checked;
  const progress = products > 0 ? Math.round((checked / products) * 100) : 0;

  return {
    products,
    checked,
    remaining,
    saved,
    unsaved,
    progress,
    expectedQty,
    receivedQty,
    shortage,
    overage,
    damaged,
    discrepancyLines,
  };
}
