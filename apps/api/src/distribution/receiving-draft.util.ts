export type ReceivingRowStatus =
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SHORTAGE'
  | 'OVERAGE'
  | 'DAMAGED';

export type DraftRowLike = {
  itemId: string;
  acceptedQuantity: number;
  damagedQuantity: number;
  missingQuantity?: number;
  note?: string | null;
  isSaved: boolean;
  lastSavedAt?: Date | string | null;
};

export type LineItemLike = {
  id: string;
  expectedQuantity: number;
};

export function computeRowDifference(acceptedQuantity: number, expectedQuantity: number) {
  return acceptedQuantity - expectedQuantity;
}

export function resolveReceivingRowStatus(
  acceptedQuantity: number,
  expectedQuantity: number,
  damagedQuantity: number,
  isSaved: boolean,
): ReceivingRowStatus {
  if (!isSaved) return 'IN_PROGRESS';
  if (damagedQuantity > 0) return 'DAMAGED';
  const diff = computeRowDifference(acceptedQuantity, expectedQuantity);
  if (diff < 0) return 'SHORTAGE';
  if (diff > 0) return 'OVERAGE';
  return 'ACCEPTED';
}

export function buildReceivingProgress(lineItems: LineItemLike[], draftRows: DraftRowLike[]) {
  const draftByItemId = new Map(draftRows.map((row) => [row.itemId, row]));
  const products = lineItems.length;
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
    const draft = draftByItemId.get(item.id);
    if (draft?.isSaved) {
      saved += 1;
      checked += 1;
      receivedQty += draft.acceptedQuantity;
      const diff = computeRowDifference(draft.acceptedQuantity, item.expectedQuantity);
      if (diff < 0) shortage += Math.abs(diff);
      if (diff > 0) overage += diff;
      if (draft.damagedQuantity > 0) damaged += draft.damagedQuantity;
      if (diff !== 0 || draft.damagedQuantity > 0) discrepancyLines += 1;
    } else if (draft) {
      unsaved += 1;
    }
  }

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
