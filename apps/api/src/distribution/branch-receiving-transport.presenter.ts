import type { BranchReceivingTransportLineCost } from './branch-receiving-transport.util';

export const TRANSPORT_COST_EMPTY_MESSAGE =
  'Введите транспортный расход.\n\nЕсли доставка была бесплатной, укажите 0.';

export const RECEIPT_BLOCKED_STALE_ALLOCATION_MESSAGE =
  'Невозможно завершить приемку. Сначала распределите актуальные транспортные расходы.';

export const TRANSPORT_ALLOCATION_SUCCESS_MESSAGE =
  'Транспортные расходы успешно распределены.\nМожно завершить приемку товара.';

export const CONFIDENTIAL_TRANSPORT_ALLOCATION_FIELDS = [
  'hqTransferUnitCost',
  'hqTransferTotalCost',
  'unitCost',
  'unitCostKgs',
  'costPrice',
  'fifoCost',
  'allocatedTransportCost',
  'allocatedTransportCostPerUnit',
  'transportExpenseAllocation',
  'transportCostPerUnit',
  'finalBranchInventoryUnitCost',
  'finalBranchInventoryTotalCost',
  'finalUnitCostKgs',
  'landedCost',
  'landedUnitCostKgs',
  'allocatedTotal',
  'allocations',
  'deliveryCostSummary',
  'productCostTotal',
  'landedCostTotal',
  'deliveryCostTotal',
  'costPerKg',
  'transferCostKgs',
  'deliveryCostKgs',
  'totalLandedCostKgs',
] as const;

export type TransportAllocationPreview = {
  totalShipmentWeightKg: number;
  transportCostKgs: number;
  allocatedTotal: number;
  allocatedAt?: string | null;
  allocations: Array<
    BranchReceivingTransportLineCost & {
      sku?: string;
      productName?: string;
      receivedQuantity: number;
      hqTransferUnitCost: number;
    }
  >;
};

export type BranchWarehouseTransportAllocationResult = {
  status: 'ALLOCATED';
  allocationCompleted: true;
  shipmentId: string;
  transportCostKgs: number;
  totalShipmentWeightKg: number;
  allocatedAt: string;
  allocationVersion: string;
  message: string;
};

export function parseReceivingTransportCostInput(
  value: unknown,
): { ok: true; transportCostKgs: number } | { ok: false; message: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: false, message: TRANSPORT_COST_EMPTY_MESSAGE };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return { ok: false, message: TRANSPORT_COST_EMPTY_MESSAGE };
  }
  if (numeric < 0) {
    return { ok: false, message: 'Транспортный расход не может быть отрицательным' };
  }
  return { ok: true, transportCostKgs: numeric };
}

export function toBranchWarehouseTransportAllocationResult(
  preview: Pick<TransportAllocationPreview, 'transportCostKgs' | 'totalShipmentWeightKg'> & {
    shipmentId: string;
    allocatedAt?: string | Date | null;
    allocationVersion: string;
  },
): BranchWarehouseTransportAllocationResult {
  const allocatedAt =
    preview.allocatedAt instanceof Date
      ? preview.allocatedAt.toISOString()
      : preview.allocatedAt ?? new Date().toISOString();
  return {
    status: 'ALLOCATED',
    allocationCompleted: true,
    shipmentId: preview.shipmentId,
    transportCostKgs: preview.transportCostKgs,
    totalShipmentWeightKg: preview.totalShipmentWeightKg,
    allocatedAt,
    allocationVersion: preview.allocationVersion,
    message: TRANSPORT_ALLOCATION_SUCCESS_MESSAGE,
  };
}

export function toAuthorizedTransportAllocationPreview(
  preview: TransportAllocationPreview,
): TransportAllocationPreview {
  return preview;
}

export function responseContainsConfidentialTransportFields(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return CONFIDENTIAL_TRANSPORT_ALLOCATION_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(record, field),
  );
}
