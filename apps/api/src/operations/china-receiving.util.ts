import { ProcurementOrderStatus } from '@prisma/client';
import {
  buildHqReceivingValidationResult,
  type HqReceivingTransportExpenseSnapshot,
} from '../procurement/hq-receiving-validation.util';

export type ChinaReceivingListStatus =
  | 'READY_FOR_RECEIVING'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'RECEIVED_WITH_DIFFERENCE';

/** Procurement statuses when goods left Yiwu — visible to assigned HQ Warehouse Manager. */
export const GOODS_LEFT_YIWU_VISIBLE_STATUSES = new Set<string>([
  ProcurementOrderStatus.SHIPPED_TO_YIWU,
  'GOODS_LEFT_YIWU',
  ProcurementOrderStatus.IN_TRANSIT,
  ProcurementOrderStatus.ARRIVED,
  ProcurementOrderStatus.ARRIVED_IN_KYRGYZSTAN,
  ProcurementOrderStatus.CUSTOMS_CLEARANCE,
  ProcurementOrderStatus.READY_TO_SHIP,
]);

type OrderLike = {
  status?: string | null;
  hqStockMovementCreatedAt?: Date | string | null;
  actualArrivalDate?: Date | string | null;
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
  id?: string;
  totalCargoCostKgs?: unknown;
  localTransportKgs?: unknown;
  chinaDomesticTransportKgs?: unknown;
  chinaDomesticTransportYuan?: unknown;
  invoiceSentToAccountantAt?: Date | string | null;
  supplierInvoiceNumber?: string | null;
  invoiceReviewStatus?: string | null;
  supplierPaymentStatus?: string | null;
  transportExpenses?: HqReceivingTransportExpenseSnapshot[];
};

export function isGoodsLeftYiwuStatus(status?: string | null) {
  if (!status) return false;
  return GOODS_LEFT_YIWU_VISIBLE_STATUSES.has(status);
}

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
  if (partial || order.actualArrivalDate) return 'PARTIALLY_RECEIVED';
  if (isGoodsLeftYiwuStatus(order.status)) return 'READY_FOR_RECEIVING';
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
    procurementOrderId: order.id,
    transportExpenses: order.transportExpenses ?? [],
    supplier: {
      invoiceSentToAccountantAt: order.invoiceSentToAccountantAt,
      supplierInvoiceNumber: order.supplierInvoiceNumber,
      invoiceReviewStatus: order.invoiceReviewStatus,
      supplierPaymentStatus: order.supplierPaymentStatus,
    },
    chinaSectionTotal:
      asNumeric(order.chinaDomesticTransportKgs) ?? asNumeric(order.chinaDomesticTransportYuan),
    cargoSectionTotal: asNumeric(order.totalCargoCostKgs),
    kyrgyzstanSectionTotal:
      asNumeric(order.localTransportKgs) ??
      asNumeric(order.svhToHqTransport?.transportCostKgs),
  });
}

export function isChinaReceivingTaskVisible(order: OrderLike) {
  if (order.hqStockMovementCreatedAt) return true;
  // HQ receiving readiness no longer depends on Import Logistics / SVH gates.
  return isGoodsLeftYiwuStatus(order.status);
}
