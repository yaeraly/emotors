export type ChinaReceivingRowStatus =
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SHORTAGE'
  | 'OVERAGE'
  | 'DAMAGED';

export type ChinaReceivingDraftState = 'DRAFT' | 'COMPLETED';

export type DraftRowLike = {
  procurementItemId: string;
  actualQuantity: number;
  damagedQuantity: number;
  note?: string | null;
  isSaved: boolean;
  lastSavedAt?: Date | string | null;
};

export type LineItemLike = {
  id: string;
  expectedQuantity: number;
};

export function resolveChinaReceivingDraftState(hqStockMovementCreatedAt?: Date | string | null): ChinaReceivingDraftState {
  return hqStockMovementCreatedAt ? 'COMPLETED' : 'DRAFT';
}

export function computeRowDifference(actualQuantity: number, expectedQuantity: number) {
  return actualQuantity - expectedQuantity;
}

export function resolveRowStatus(
  actualQuantity: number,
  expectedQuantity: number,
  damagedQuantity: number,
  isSaved: boolean,
): ChinaReceivingRowStatus {
  if (!isSaved) return 'IN_PROGRESS';
  if (damagedQuantity > 0) return 'DAMAGED';
  const diff = computeRowDifference(actualQuantity, expectedQuantity);
  if (diff < 0) return 'SHORTAGE';
  if (diff > 0) return 'OVERAGE';
  return 'ACCEPTED';
}

export function buildChinaReceivingProgress(
  lineItems: LineItemLike[],
  draftRows: DraftRowLike[],
) {
  const draftByItemId = new Map(draftRows.map((row) => [row.procurementItemId, row]));
  const products = lineItems.length;
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
    const draft = draftByItemId.get(item.id);
    if (draft?.isSaved) {
      saved += 1;
      checked += 1;
      receivedQty += draft.actualQuantity;
      const diff = computeRowDifference(draft.actualQuantity, item.expectedQuantity);
      if (diff < 0) shortage += Math.abs(diff);
      if (diff > 0) overage += diff;
      if (draft.damagedQuantity > 0) damaged += draft.damagedQuantity;
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
  };
}

export type ReceivingBatchItemLike = {
  productId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
};

export type DiscrepancyActLike = {
  differenceType: string;
};

export function buildChinaReceivingSummaryFromBatches(
  batchItems: ReceivingBatchItemLike[],
  discrepancyActs: DiscrepancyActLike[],
) {
  const productIds = new Set(batchItems.map((item) => item.productId));
  let totalExpected = 0;
  let totalReceived = 0;
  let shortage = 0;
  let overage = 0;
  let damaged = 0;

  for (const item of batchItems) {
    totalExpected += item.expectedQuantity;
    totalReceived += item.receivedQuantity;
    const diff = item.receivedQuantity - item.expectedQuantity;
    if (diff < 0) shortage += Math.abs(diff);
    if (diff > 0) overage += diff;
    damaged += item.damagedQuantity;
  }

  const discrepancyCounts = {
    shortage: discrepancyActs.filter((act) => act.differenceType === 'SHORTAGE').length,
    overage: discrepancyActs.filter((act) => act.differenceType === 'OVERAGE').length,
    damaged: discrepancyActs.filter((act) => act.differenceType === 'DAMAGED').length,
  };

  return {
    totalProducts: productIds.size,
    totalExpected,
    totalReceived,
    shortage,
    overage,
    damaged,
    discrepancyCounts,
  };
}

export const CHINA_RECEIVING_SESSION_STALE_MS = 5 * 60 * 1000;

export function isChinaReceivingSessionStale(lastHeartbeatAt: Date | string, now = Date.now()) {
  const heartbeat = new Date(lastHeartbeatAt).getTime();
  return now - heartbeat > CHINA_RECEIVING_SESSION_STALE_MS;
}
