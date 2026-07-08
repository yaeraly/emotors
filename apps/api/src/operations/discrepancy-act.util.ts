import { ShortageReportItemType } from '@prisma/client';

export type DiscrepancyActContext = {
  batchId: string;
  procurementOrderId?: string;
  distributionOrderId?: string;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  productId: string;
  expectedQty: number;
  actualQty: number;
  differenceQty: number;
  differenceType: ShortageReportItemType;
  reason?: string | null;
  createdById: string;
};

export function resolveDifferenceType(
  expectedQty: number,
  actualQty: number,
  reason?: string | null,
): ShortageReportItemType | null {
  const difference = actualQty - expectedQty;
  if (difference === 0) return null;

  const normalizedReason = (reason ?? '').toUpperCase();
  if (
    normalizedReason === 'DAMAGED' ||
    normalizedReason === 'DAMAGED_GOODS' ||
    normalizedReason.includes('DAMAGED')
  ) {
    return ShortageReportItemType.DAMAGED;
  }

  return difference < 0 ? ShortageReportItemType.SHORTAGE : ShortageReportItemType.OVERAGE;
}

export function differenceAuditAction(type: ShortageReportItemType): string {
  switch (type) {
    case ShortageReportItemType.SHORTAGE:
      return 'SHORTAGE_ACT_CREATED';
    case ShortageReportItemType.OVERAGE:
      return 'OVERAGE_ACT_CREATED';
    case ShortageReportItemType.DAMAGED:
      return 'DAMAGED_ACT_CREATED';
    default:
      return 'DISCREPANCY_ACT_CREATED_PER_BATCH';
  }
}

export function buildDiscrepancyActAuditMetadata(
  context: DiscrepancyActContext,
  extra?: Record<string, unknown>,
) {
  return {
    batchId: context.batchId,
    shipmentBatchId: context.batchId,
    procurementOrderId: context.procurementOrderId,
    distributionOrderId: context.distributionOrderId,
    sourceWarehouseId: context.sourceWarehouseId,
    destinationWarehouseId: context.destinationWarehouseId,
    productId: context.productId,
    expectedQty: context.expectedQty,
    actualQty: context.actualQty,
    differenceQty: context.differenceQty,
    differenceType: context.differenceType,
    reason: context.reason,
    createdBy: context.createdById,
    ...extra,
  };
}

export function buildBatchDiscrepancyAuditMetadata(
  batchId: string,
  actIds: string[],
  extra?: Record<string, unknown>,
) {
  return {
    batchId,
    shipmentBatchId: batchId,
    actIds,
    actCount: actIds.length,
    ...extra,
  };
}

export function generateProcurementActNumber(prefix: string, productId: string, batchId: string) {
  return `${prefix}-${batchId.slice(-6)}-${productId.slice(-4)}`;
}
