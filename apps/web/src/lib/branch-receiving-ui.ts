import { computeDifference } from './branch-receiving-draft';

/** i18n keys for compact quantity column headers on the receiving table. */
export const BRANCH_RECEIVING_QUANTITY_HEADER_KEYS = {
  sentQuantity: 'distribution.sentQuantityShort',
  acceptedQuantity: 'distribution.acceptedQuantityShort',
} as const;

/** Legacy long labels that must not be used on the receiving table. */
export const BRANCH_RECEIVING_LEGACY_QUANTITY_HEADER_KEYS = [
  'distribution.sentQuantity',
  'distribution.acceptedQuantity',
] as const;

export const BRANCH_RECEIVING_PRODUCT_NAME_CELL_CLASS =
  'break-words whitespace-normal font-medium text-slate-900';

export function productNameDisplayUsesTruncation(className: string): boolean {
  return /\btruncate\b/.test(className) || /\bline-clamp-\d+\b/.test(className);
}

export function allowsProductNameWrapping(className: string): boolean {
  return /\bbreak-words\b/.test(className) && /\bwhitespace-normal\b/.test(className);
}

/** Visible columns on Branch Warehouse receiving product table (in order). */
export const BRANCH_RECEIVING_TABLE_COLUMNS = [
  'sku',
  'product',
  'sentQuantity',
  'acceptedQuantity',
  'damagedQuantity',
  'difference',
  'notes',
  'actions',
] as const;

/** Columns removed from the receiving table UI (logic may remain internal). */
export const REMOVED_BRANCH_RECEIVING_TABLE_COLUMNS = ['missingQuantity', 'status'] as const;

export function shouldShowReceivingBranchField(isOperatorView: boolean): boolean {
  return !isOperatorView;
}

export function shouldShowTransportCompanyField(): boolean {
  return false;
}

export type BranchReceivingTransportFormState = {
  driverName: string;
  vehicleNumber: string;
  transportCostKgs: string;
  transportNotes: string;
};

export function buildBranchReceivingTransportPayload(form: BranchReceivingTransportFormState) {
  const transportCostKgs = Number(form.transportCostKgs);
  return {
    driverName: form.driverName.trim() || undefined,
    vehicleNumber: form.vehicleNumber.trim() || undefined,
    comment: form.transportNotes.trim() || undefined,
    transportCostKgs,
  };
}

export const TRANSPORT_COST_EMPTY_MESSAGE =
  'Введите транспортный расход.\n\nЕсли доставка была бесплатной, укажите 0.';

export const TRANSPORT_ALLOCATION_SUCCESS_MESSAGE =
  'Транспортные расходы успешно распределены.\nМожно завершить приемку товара.';

export const COMPLETE_RECEIVING_REQUIRES_ALLOCATION =
  'Сначала сохраните товары и распределите транспортные расходы.';

export const BRANCH_RECEIVING_COMPLETED_MESSAGE =
  'Товар успешно принят на склад филиала.';

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

export function validateTransportCostInput(
  value: string,
): { ok: true; transportCostKgs: number } | { ok: false; message: string } {
  if (value.trim() === '') {
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

export function quantitiesReadyForBranchReceiving(input: {
  allSaved: boolean;
  products: number;
  checked: number;
}) {
  return input.allSaved && input.products > 0 && input.checked === input.products;
}

export function canCompleteBranchReceiving(input: {
  allSaved: boolean;
  products: number;
  checked: number;
  transportAllocationReady: boolean;
  receiptCompleted?: boolean;
}) {
  if (input.receiptCompleted) return false;
  return (
    quantitiesReadyForBranchReceiving(input) &&
    input.transportAllocationReady
  );
}

export function allocationResponseIsBranchSafe(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  const forbidden = [
    'hqTransferUnitCost',
    'transportExpenseAllocation',
    'transportCostPerUnit',
    'finalUnitCostKgs',
    'allocatedTotal',
    'allocations',
  ];
  return !forbidden.some((field) => Object.prototype.hasOwnProperty.call(record, field));
}

/** Derive shortage quantity when the missing-quantity column is hidden. */
export function deriveMissingQuantity(expected: number, accepted: number, damaged: number) {
  return Math.max(expected - accepted - damaged, 0);
}

export { computeDifference };
