import { BadRequestException } from '@nestjs/common';
import { ShortageReportItemType } from '@prisma/client';
import { resolveDifferenceType } from '../operations/discrepancy-act.util';
import { resolveReceivingDifferenceQuantity } from './branch-receiving.util';
import { resolveReceivingRowStatus } from './receiving-draft.util';

export type BranchReceivingDraftInput = {
  acceptedQuantity: number;
  damagedQuantity: number;
  missingQuantity?: number;
  note?: string;
};

export function normalizeBranchReceivingDraftInput(
  input: BranchReceivingDraftInput,
  dispatchedQuantity: number,
) {
  const acceptedQuantity = Math.max(Number(input.acceptedQuantity ?? 0), 0);
  const damagedQuantity = Math.max(Number(input.damagedQuantity ?? 0), 0);
  const missingQuantity =
    input.missingQuantity != null
      ? Math.max(Number(input.missingQuantity), 0)
      : Math.max(dispatchedQuantity - acceptedQuantity - damagedQuantity, 0);

  validateBranchReceivingQuantities(dispatchedQuantity, acceptedQuantity, damagedQuantity, missingQuantity);

  return {
    acceptedQuantity,
    damagedQuantity,
    missingQuantity,
    note: input.note?.trim() || undefined,
  };
}

export function validateBranchReceivingQuantities(
  dispatchedQuantity: number,
  acceptedQuantity: number,
  damagedQuantity: number,
  missingQuantity: number,
) {
  if (acceptedQuantity < 0 || damagedQuantity < 0 || missingQuantity < 0) {
    throw new BadRequestException('Quantity cannot be negative');
  }
  if (acceptedQuantity > dispatchedQuantity) {
    throw new BadRequestException('Accepted quantity exceeds shipped quantity');
  }
  const reportedTotal = acceptedQuantity + damagedQuantity + missingQuantity;
  if (reportedTotal > dispatchedQuantity) {
    throw new BadRequestException('Total reported quantity exceeds shipped quantity');
  }
}

export function buildBranchReceivingDiscrepancyPayload(
  orderItem: { id: string; productId: string },
  order: { id: string; branchId: string },
  dispatchedQuantity: number,
  acceptedQuantity: number,
  damagedQuantity: number,
  missingQuantity: number,
  note?: string,
) {
  const receivedQuantity = acceptedQuantity + damagedQuantity;
  const difference = resolveReceivingDifferenceQuantity(
    dispatchedQuantity,
    acceptedQuantity,
    damagedQuantity,
    missingQuantity,
  );
  if (difference === 0 && damagedQuantity === 0 && missingQuantity === 0) {
    return null;
  }
  const differenceType = resolveDifferenceType(
    dispatchedQuantity,
    receivedQuantity,
    note,
  );
  if (!differenceType) return null;

  return {
    distributionOrderId: order.id,
    distributionOrderItemId: orderItem.id,
    productId: orderItem.productId,
    branchId: order.branchId,
    expectedQuantity: dispatchedQuantity,
    receivedQuantity,
    differenceQuantity: Math.max(Math.abs(receivedQuantity - dispatchedQuantity), missingQuantity),
    type: differenceType as ShortageReportItemType,
    note,
  };
}

export function mapDraftRowToLineItem(
  orderItem: {
    id: string;
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    dispatchedQuantity: number | null;
    product?: { unit?: string | null } | null;
  },
  draft?: {
    acceptedQuantity: number;
    damagedQuantity: number;
    missingQuantity: number;
    note: string | null;
    isSaved: boolean;
    lastSavedAt: Date | null;
    updatedAt: Date;
  } | null,
) {
  const expectedQuantity = Number(orderItem.dispatchedQuantity ?? orderItem.quantity);
  const acceptedQuantity = draft?.isSaved ? draft.acceptedQuantity : draft?.acceptedQuantity ?? expectedQuantity;
  const damagedQuantity = draft?.damagedQuantity ?? 0;
  const missingQuantity = draft?.missingQuantity ?? 0;
  const isSaved = Boolean(draft?.isSaved);
  const difference = acceptedQuantity - expectedQuantity;

  return {
    id: orderItem.id,
    productId: orderItem.productId,
    sku: orderItem.sku,
    productName: orderItem.productName,
    unit: orderItem.product?.unit ?? 'pcs',
    expectedQuantity,
    acceptedQuantity: draft?.isSaved ? draft.acceptedQuantity : null,
    damagedQuantity,
    missingQuantity: draft?.isSaved ? draft.missingQuantity : null,
    note: draft?.note ?? null,
    isSaved,
    lastSavedAt: draft?.lastSavedAt?.toISOString() ?? null,
    updatedAt: draft?.updatedAt?.toISOString() ?? null,
    rowStatus: resolveReceivingRowStatus(acceptedQuantity, expectedQuantity, damagedQuantity, isSaved),
    difference,
  };
}
