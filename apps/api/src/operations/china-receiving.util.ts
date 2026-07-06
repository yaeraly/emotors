import { buildHqReceivingValidationResult } from '../procurement/hq-receiving-validation.util';

export type ChinaReceivingListStatus =
  | 'READY_FOR_RECEIVING'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'RECEIVED_WITH_DIFFERENCE';

type OrderLike = {
  hqStockMovementCreatedAt?: Date | string | null;
  items?: Array<{ quantity: number; receivedQuantity?: number | null }>;
  differenceReports?: Array<{ deletedAt?: Date | string | null }>;
  receivings?: Array<{
    deletedAt?: Date | string | null;
    items?: Array<{ differenceQuantity: number }>;
  }>;
  cargoTotalWeightKg?: unknown;
  cargoRateUsdPerKg?: unknown;
  defaultUsdRate?: unknown;
  cargoReceiptNumber?: string | null;
  cargoReceiptDate?: Date | string | null;
  svhToHqTransport?: {
    transportCompanyId?: string | null;
    transportCostKgs?: unknown;
    dispatchDate?: Date | string | null;
    arrivalDate?: Date | string | null;
    status?: string | null;
    transportCompany?: { status?: string | null } | null;
  } | null;
  cargoAttachmentCount?: number;
};

export function resolveChinaReceivingListStatus(order: OrderLike): ChinaReceivingListStatus {
  if (order.hqStockMovementCreatedAt) {
    const hasDifference =
      (order.differenceReports ?? []).some((report) => !report.deletedAt) ||
      (order.receivings ?? [])
        .filter((receiving) => !receiving.deletedAt)
        .some((receiving) => (receiving.items ?? []).some((item) => item.differenceQuantity > 0));
    return hasDifference ? 'RECEIVED_WITH_DIFFERENCE' : 'RECEIVED';
  }

  const partial = (order.items ?? []).some((item) => (item.receivedQuantity ?? 0) > 0);
  if (partial) return 'PARTIALLY_RECEIVED';
  return 'READY_FOR_RECEIVING';
}

function asNumeric(value: unknown): number | string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

export function buildChinaReceivingValidation(order: OrderLike) {
  return buildHqReceivingValidationResult({
    cargo: {
      cargoTotalWeightKg: asNumeric(order.cargoTotalWeightKg),
      cargoRateUsdPerKg: asNumeric(order.cargoRateUsdPerKg),
      defaultUsdRate: asNumeric(order.defaultUsdRate),
      cargoReceiptNumber: order.cargoReceiptNumber,
      cargoReceiptDate: order.cargoReceiptDate,
      cargoAttachmentCount: order.cargoAttachmentCount ?? 0,
    },
    svh: order.svhToHqTransport
      ? {
          transportCompanyId: order.svhToHqTransport.transportCompanyId,
          transportCostKgs: asNumeric(order.svhToHqTransport.transportCostKgs),
          dispatchDate: order.svhToHqTransport.dispatchDate,
          arrivalDate: order.svhToHqTransport.arrivalDate,
          status: order.svhToHqTransport.status,
          transportCompanyStatus: order.svhToHqTransport.transportCompany?.status ?? null,
        }
      : null,
  });
}

export function isChinaReceivingTaskVisible(order: OrderLike) {
  if (order.hqStockMovementCreatedAt) return true;
  return buildChinaReceivingValidation(order).canReceiveToHq;
}
