export type ReceivingLineInput = {
  shipmentItemId?: string;
  distributionOrderItemId?: string;
  acceptedQuantity?: number;
  receivedQuantity?: number;
  damagedQuantity?: number;
  missingQuantity?: number;
  discrepancyReason?: string;
  note?: string;
};

export type NormalizedReceivingLine = {
  shipmentItemId: string;
  acceptedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  discrepancyReason?: string;
  note?: string;
};

export function resolveShipmentItemId(item: ReceivingLineInput): string | null {
  const shipmentItemId = item.shipmentItemId?.trim() || item.distributionOrderItemId?.trim();
  return shipmentItemId || null;
}

export function normalizeReceivingLine(
  item: ReceivingLineInput,
  dispatchedQuantity: number,
): NormalizedReceivingLine {
  const shipmentItemId = resolveShipmentItemId(item);
  if (!shipmentItemId) {
    throw new Error('Shipment item not found');
  }

  const damagedQuantity = Math.max(Number(item.damagedQuantity ?? 0), 0);
  const legacyReceived = Math.max(Number(item.receivedQuantity ?? 0), 0);
  const acceptedQuantity = Math.max(
    item.acceptedQuantity != null ? Number(item.acceptedQuantity) : legacyReceived - damagedQuantity,
    0,
  );
  const missingQuantity =
    item.missingQuantity != null
      ? Math.max(Number(item.missingQuantity), 0)
      : Math.max(dispatchedQuantity - acceptedQuantity - damagedQuantity, 0);

  return {
    shipmentItemId,
    acceptedQuantity,
    damagedQuantity,
    missingQuantity,
    discrepancyReason: item.discrepancyReason?.trim() || item.note?.trim() || undefined,
    note: item.note?.trim() || item.discrepancyReason?.trim() || undefined,
  };
}

export function resolveReceivingDifferenceQuantity(
  dispatchedQuantity: number,
  acceptedQuantity: number,
  damagedQuantity: number,
  missingQuantity: number,
) {
  const reportedTotal = acceptedQuantity + damagedQuantity + missingQuantity;
  return reportedTotal - dispatchedQuantity;
}
